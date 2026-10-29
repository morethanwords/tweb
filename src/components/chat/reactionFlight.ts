/*
 * A reaction chosen for a message flies from where it was chosen to where it stands in the message, as Telegram for
 * iOS flies it (ReactionContextNode.animateOutToReaction):
 *
 * - as it is chosen, a picture of it stays where it is, over the menu that goes (`holdReactionFlight`);
 * - once the message shows it (`launchReactionFlight`, from its row of reactions), the picture is tossed there: its
 *   middle goes across straight on the time and up and down on a parabola over where it starts, as it grows or shrinks
 *   to its size there; the reaction in the message is hidden till it lands, if it was not there before (as Android
 *   hides it: one there already does not blink);
 * - on its way it gives way to a picture of what the message shows there, and lands as that. The reaction's effect
 *   starts around it as it comes near, and the reaction plays in its place as it lands (`ReactionsElement`).
 *
 * Laid out once at its end and moved by the compositor, on the frames of the window the chat is in. Only with full
 * animations ("motion"): a flight is a movement; with less, the reaction is just there.
 */

import type {Message, Reaction} from '@layer';
import liteMode from '@helpers/liteMode';
import noop from '@helpers/noop';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import {getAppWindow, getOverlayRoot, onBeforeAppWindowChange} from '@helpers/appWindow';
import {hotEffect} from '@helpers/hotModule';
import reactionsEqual from '@appManagers/utils/reactions/reactionsEqual';
import apiManagerProxy from '@lib/apiManagerProxy';
import {captureReactionPicture, ReactionPicture} from '@components/chat/reaction';
import copyElement, {keepContext} from '@components/chat/copyElement';
import {animateTracks, createTracks, startOnNextFrame, Track} from '@components/chat/bubbleShape';
import styles from '@components/chat/reactionFlight.module.scss';

// as long as the desktop app's flight (ReactionFlyAnimation): iOS's 200 ms, over a desktop's distances, flickers
const DURATION = 300;
const ways = createTracks({x: 'linear', y: 'linear', duration: DURATION});
// how high over where it starts the middle of its way goes (generateParabollicMotionKeyframes' elevation), unless it
// goes nowhere much
const ELEVATION = 30;
const NEAR = 5;
// the parabola is made of this many straight steps
const STEPS = 16;
// what it lands as is there by this much of its time (as iOS's reaction comes in its flying node), and what it was
// chosen as goes over the whole of it
const LANDING_UNTIL = .75;
// how much of its time it takes to come near, when the effect around it starts
const HIT_AT = .75;
// how long a picture waits for the message to show the reaction, and goes if it does not
const HOLD_TIMEOUT = 1000;
const DROP_DURATION = 150;

type Box = {left: number, top: number, width: number, height: number};

type Flight = {
  key: string,
  reaction: Reaction,
  // what the message it is for is shown in
  scrollable: HTMLElement,
  element: HTMLElement,
  path: HTMLElement,
  picture: ReactionPicture,
  // the chosen reaction's own picture, hidden while the flight stands for it
  source: HTMLElement,
  timeout?: number,
  hit: CancellablePromise<void>,
  landed: CancellablePromise<void>,
  end?: VoidFunction
};

/** a flight to a reaction: when it comes near, and when it lands */
export type ReactionFlight = Pick<Flight, 'hit' | 'landed'>;

let held: Flight;
const flying: Set<Flight> = new Set();

/**
 * A reaction is chosen for a message, by `source` (a menu's reaction, an emoji of the whole choice, the quick
 * reaction): a picture of it stays where it is till the message shows it. Nothing if the message has it chosen
 * already, as it shows now: choosing it takes it off
 */
export function holdReactionFlight({reaction, source, message, scrollable}: {
  reaction: Reaction,
  source: HTMLElement,
  message: Message.message | Message.messageService,
  scrollable: HTMLElement
}) {
  const shown = message && (apiManagerProxy.getMessageByPeer(message.peerId, message.mid) ?? message);
  if(
    !liteMode.isAvailable('motion') ||
    !shown ||
    reaction._ === 'reactionPaid' ||
    reaction._ === 'reactionEmpty' ||
    shown.reactions?.results.some((reactionCount) => reactionCount.chosen_order !== undefined && reactionsEqual(reactionCount.reaction, reaction))
  ) {
    return;
  }

  const picture = captureReactionPicture(source);
  if(!picture) {
    return;
  }

  if(held) {
    drop(held);
  }

  const element = document.createElement('div');
  element.classList.add(styles.flight);
  // a picture of what the message shows, and says, already
  element.setAttribute('aria-hidden', 'true');
  element.style.left = `${picture.box.left}px`;
  element.style.top = `${picture.box.top}px`;
  element.style.width = element.style.height = `${picture.box.size}px`;
  // up in it, across and to its size in this
  const path = document.createElement('div');
  path.classList.add(styles.path);
  picture.canvas.classList.add(styles.picture);
  path.append(picture.canvas);
  element.append(path);
  getOverlayRoot().append(element);

  // a custom emoji is drawn by a canvas of its own (its renderer's): the menu takes it away with itself
  const media = picture.media.localName === 'custom-emoji-element' ? undefined : picture.media;
  media?.style.setProperty('visibility', 'hidden');

  const flight: Flight = held = {
    key: message.peerId + '_' + message.mid,
    reaction,
    scrollable,
    element,
    path,
    picture,
    source: media,
    hit: deferredPromise(),
    landed: deferredPromise()
  };
  flight.timeout = window.setTimeout(() => drop(flight), HOLD_TIMEOUT);
}

/** Whether a picture of `reaction` (any, if not given) waits for the message `key` (its peer and mid) to show it */
export function isReactionFlightHeld(key: string, reaction?: Reaction) {
  return !!held && held.key === key && (!reaction || reactionsEqual(held.reaction, reaction));
}

/**
 * The message `key` shows the reaction, in `target` (its reaction's sticker), laid out where it ends: the picture held
 * for it flies there. `hide` hides the reaction there till it lands, and gives what shows it again
 */
export function launchReactionFlight({key, reaction, target, hide}: {
  key: string,
  reaction: Reaction,
  target: HTMLElement,
  hide?: () => VoidFunction
}): ReactionFlight {
  const flight = held;
  if(!isReactionFlightHeld(key, reaction) || !target.isConnected || !flight.scrollable.contains(target)) {
    return;
  }

  held = undefined;
  window.clearTimeout(flight.timeout);

  const rect = target.getBoundingClientRect();
  const view = flight.scrollable.getBoundingClientRect();
  if(!rect.width || rect.bottom <= view.top || rect.top >= view.bottom) {
    drop(flight);
    return;
  }

  const to: Box = {left: rect.left, top: rect.top, width: rect.width, height: rect.height};
  const landing = copyLanding(target, to);
  const show = hide?.();
  fly(flight, to, landing);

  const scrollTop = flight.scrollable.scrollTop;
  const onScroll = () => {
    flight.element.style.translate = `0px ${scrollTop - flight.scrollable.scrollTop}px`;
  };
  flight.scrollable.addEventListener('scroll', onScroll, {passive: true});
  flight.end = () => {
    flight.scrollable.removeEventListener('scroll', onScroll);
    show?.();
  };

  return flight;
}

// what the message shows as the reaction (its sticker, or the picture standing for it till it loads) as big as it is
// there: what the flight lands as. None for what a copy cannot show (a custom emoji, drawn by its row's canvas)
function copyLanding(target: HTMLElement, to: Box) {
  const shown = target.querySelector<HTMLElement>('.reaction-sticker-placeholder, canvas.media-sticker, video.media-sticker, img.media-sticker');
  if(!shown || (shown instanceof HTMLImageElement && !(shown.complete && shown.naturalWidth))) {
    return;
  }

  const copy = copyElement(target);
  // the sizes it gets from the row it is in
  keepContext(target, copy, getOverlayRoot());
  copy.classList.add(styles.landing);
  copy.style.width = `${to.width}px`;
  copy.style.height = `${to.height}px`;
  return copy;
}

function fly(flight: Flight, to: Box, landing: HTMLElement) {
  flying.add(flight);
  const {element, path, picture: {canvas, box: from}} = flight;
  const scaleX = to.width / from.size;
  const scaleY = to.height / from.size;
  if(landing) {
    landing.style.transform = `scale(${1 / scaleX}, ${1 / scaleY})`;
    path.append(landing);
  }

  // its middle up and down: through where it starts, a point over that halfway across and where it ends, its top as
  // far over that as half its height then (it is scaled from its top, across)
  const startY = from.top + from.size / 2;
  const endY = to.top + to.height / 2;
  const near = Math.abs(to.left - from.left) < NEAR && Math.abs(endY - startY) < NEAR;
  const halfwayY = near ? (startY + endY) / 2 : startY - ELEVATION;
  const b = 4 * (halfwayY - startY) - (endY - startY);
  const a = endY - startY - b;
  const up: Keyframe[] = [];
  for(let i = 0; i <= STEPS; ++i) {
    const offset = i / STEPS;
    const height = from.size * (1 + (scaleY - 1) * offset);
    const middle = startY + b * offset + a * offset * offset;
    up.push({transform: `translateY(${middle - height / 2 - from.top}px)`, offset});
  }

  const tracks: Track[] = [
    {element, keyframes: up, easing: 'linear'},
    ways.across(path, 'translateX(0px) scale(1, 1)', `translateX(${to.left - from.left}px) scale(${scaleX}, ${scaleY})`)
  ];
  if(landing) {
    tracks.push(
      ways.fade(landing, [0, 0], [1, DURATION * LANDING_UNTIL], [1, DURATION]),
      ways.fade(canvas, [1, 0], [0, DURATION])
    );
  }

  const animations = animateTracks(tracks, DURATION);
  // on the flight's own clock, which starts with it
  const hit = path.animate([], {duration: DURATION * HIT_AT});
  startOnNextFrame([hit]);
  hit.finished.then(() => flight.hit.resolve(), noop);
  // over when it is, or long after it should have been: one whose clock stopped (a window gone) would hold the effect
  // that waits for it
  const timeout = window.setTimeout(() => land(flight), DURATION * 20 + 1000);
  Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
    window.clearTimeout(timeout);
    land(flight);
  });
}

function land(flight: Flight) {
  if(!flying.delete(flight)) {
    return;
  }

  flight.end?.();
  flight.element.remove();
  flight.source?.style.removeProperty('visibility');
  flight.hit.resolve();
  flight.landed.resolve();
}

// a picture whose reaction is not shown (taken off, out of sight, elsewhere) goes where it is
function drop(flight: Flight) {
  if(held === flight) {
    held = undefined;
  }

  window.clearTimeout(flight.timeout);
  flying.delete(flight);
  flight.end?.();
  flight.source?.style.removeProperty('visibility');
  flight.hit.resolve();
  flight.landed.resolve();
  const {element} = flight;
  const animation = element.animate([{opacity: 1}, {opacity: 0}], {duration: DROP_DURATION, easing: 'linear', fill: 'forwards'});
  const remove = () => element.remove();
  animation.finished.then(remove, remove);
  getAppWindow().setTimeout(remove, DROP_DURATION + 100);
}

function dropAll() {
  if(held) {
    drop(held);
  }

  flying.forEach(drop);
}

/** What flies to the messages `scrollable` shows goes: it is about to show others, or none */
export function dropReactionFlights(scrollable: HTMLElement) {
  if(held?.scrollable === scrollable) {
    drop(held);
  }

  flying.forEach((flight) => {
    if(flight.scrollable === scrollable) {
      drop(flight);
    }
  });
}

// the app moving to another window takes what stands over it along: what flies there goes
hotEffect(import.meta.hot, () => onBeforeAppWindowChange(dropAll));
