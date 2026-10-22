/*
 * Whether anything that can move a custom emoji happened since they were last measured.
 *
 * The emoji tick measures where every emoji is, and a measurement is a read of the layout. When the
 * page changed since its last frame - a node, a class, the clock of a running animation - that read
 * makes the browser work the style and the layout out there and then, and once more for the frame:
 * in a chat with paid reactions their sparkles alone made each read 2-3 ms, sixty times a second, for
 * as long as the chat was open. So the tick measures only after something that can move an emoji: a
 * change of the document, a scroll, a resize, a transition of something that moves or a keyframe
 * animation where an emoji is (for as long as it runs, a second at most: an endless one is decoration), or a change in
 * the renderer's own state (`CustomEmojiRendererElement.stateSignature`) - and it does that at the
 * start of the next frame, where the read is the frame's own work. What moves without any of these
 * (Web Animations, an image or a font changing the layout) is caught by a measurement once a second.
 * Nothing here reads the page: asking an element for its animations would work its style out too.
 * It watches the document the app is in, which moves into a Document PiP window and back.
 */

import {bindActiveWindowListener, getAppWindow, onAppWindowChange} from '@helpers/appWindow';

// * the attributes that can move something: `aria-*` and `data-*` change all the time and move nothing
const MUTATIONS: MutationObserverInit = {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['class', 'style', 'hidden', 'dir', 'src', 'srcset', 'width', 'height', 'open', 'colspan', 'rowspan', 'contenteditable']
};
// * what a transition has to change to move something
const MOVES = /^(transform|translate|scale|rotate|offset|all|width|height|(min|max)-(width|height)|inset|top|left|right|bottom|margin|padding|border(-(top|bottom|left|right|block|inline)(-(start|end))?)?-width|font-size|line-height|letter-spacing|flex|grid|gap|(row|column)-gap|block-size|inline-size)/;
// * the longest a motion is waited out for
const MOTION_MAX_MS = 1000;

let changed = true, watching = false;
let onChange: () => void, isRelevant: (node: Node) => boolean;
// * what is moving: the element, and until when each of its motions is waited out
const moving: Map<EventTarget, Map<string, number>> = new Map();

const observer = new MutationObserver(() => {
  observer.disconnect(); // * one record is enough until the next measurement
  markEmojiLayoutChanged();
});

const getMotionName = (e: TransitionEvent | AnimationEvent) => {
  return (e as TransitionEvent).propertyName ?? (e as AnimationEvent).animationName;
};

const onMotionStart = (e: TransitionEvent | AnimationEvent) => {
  const name = getMotionName(e);
  if(e.type === 'transitionrun' && !MOVES.test(name)) {
    return;
  }

  // * a motion away from every emoji (the media viewer opening over the chat) moves none of them
  if(isRelevant && !isRelevant(e.target as Node)) {
    return;
  }

  let motions = moving.get(e.target);
  if(!motions) {
    moving.set(e.target, motions = new Map());
  }

  motions.set(name, performance.now() + MOTION_MAX_MS);
  markEmojiLayoutChanged();
};

const onMotionEnd = (e: TransitionEvent | AnimationEvent) => {
  const motions = moving.get(e.target);
  if(!motions?.delete(getMotionName(e))) {
    return;
  }

  if(!motions.size) {
    moving.delete(e.target);
  }

  markEmojiLayoutChanged();
};

const onChangeEvent = () => markEmojiLayoutChanged();

// * the window the app is in: the tab's, or a Document PiP window it moved into
const getDocument = (win: Window) => win.document;
const LISTENER_OPTIONS: AddEventListenerOptions = {capture: true, passive: true};
let unbind: (() => void)[] = [];

const observe = () => observer.observe(getAppWindow().document.documentElement, MUTATIONS);

export function markEmojiLayoutChanged() {
  if(changed) {
    return;
  }

  changed = true;
  onChange?.();
}

/**
 * Starts watching, while there are emoji to draw; `callback` is called when a measurement becomes due,
 * `relevant` says whether something moving there can move an emoji
 */
export function watchEmojiLayout(callback: () => void, relevant?: (node: Node) => boolean) {
  onChange = callback;
  isRelevant = relevant;
  if(watching) {
    return;
  }

  watching = true;
  unbind = [
    bindActiveWindowListener(getDocument, 'scroll', onChangeEvent, LISTENER_OPTIONS),
    bindActiveWindowListener((win) => win, 'resize', onChangeEvent, LISTENER_OPTIONS),
    bindActiveWindowListener(getDocument, 'transitionrun', onMotionStart, LISTENER_OPTIONS),
    bindActiveWindowListener(getDocument, 'animationstart', onMotionStart, LISTENER_OPTIONS),
    bindActiveWindowListener(getDocument, 'transitionend', onMotionEnd, LISTENER_OPTIONS),
    bindActiveWindowListener(getDocument, 'transitioncancel', onMotionEnd, LISTENER_OPTIONS),
    bindActiveWindowListener(getDocument, 'animationend', onMotionEnd, LISTENER_OPTIONS),
    bindActiveWindowListener(getDocument, 'animationcancel', onMotionEnd, LISTENER_OPTIONS),
    onAppWindowChange(() => { // * the move itself is a change
      observer.disconnect();
      moving.clear();
      changed = false;
      observe();
      markEmojiLayoutChanged();
    })
  ];

  changed = false;
  observe();
}

export function unwatchEmojiLayout() {
  if(!watching) {
    return;
  }

  watching = false;
  onChange = isRelevant = undefined;
  unbind.forEach((callback) => callback());
  unbind = [];

  observer.disconnect();
  moving.clear();
  changed = true;
}

/** Whether something that moves is running, waited out for a second at most */
export function isEmojiLayoutMoving() {
  if(!moving.size) {
    return false;
  }

  const now = performance.now();
  for(const [target, motions] of moving) {
    for(const [name, until] of motions) {
      if(until <= now) {
        motions.delete(name);
      }
    }

    if(!motions.size) {
      moving.delete(target);
    }
  }

  return !!moving.size;
}

/** Measures: what the callback itself changes is not taken for a change, what comes after is */
export function measureEmojiLayout<T>(callback: () => T): T {
  if(watching) {
    observer.disconnect();
  }

  try {
    return callback();
  } finally {
    if(watching) {
      changed = false;
      observe();
    }
  }
}
