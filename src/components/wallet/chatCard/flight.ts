/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {getAppWindow, getOverlayRoot} from '@helpers/appWindow';
import {Appearance, GemView} from '@components/wallet/visual/gem/stage';
import type {AmountSceneLaunch} from '@components/wallet/visual/amount/scene';
import {pixelRatio} from '@components/wallet/visual/dom';
import {FLY_CANVAS, toss} from '@components/wallet/visual/flow/timing';
import {addWalletFrameClient} from '@components/wallet/frameLoop';
import {getWalletChatCardTarget, WalletChatCardTarget} from '@components/wallet/chatCard/targets';

/**
 * A send started in the recipient's chat ends in that chat (iOS ChatWalletTransferAnimation): the wallet closes
 * and the amount screen's gem flies into the transfer's new card — a parabola that hops 56 px over the higher of
 * its ends, the gem swelling at the top and spinning up, cooled to the card's colour on the way down. The card's
 * own gem steps aside until it lands, and the card takes the hit. No card in sight within half a second, or the
 * card scrolled away mid-flight: the gem fades where it is.
 */

/** the flight, seconds */
const FLIGHT = .62;
/** the hop over the higher end, px */
const APEX = 56;
/** the card has this long to show up, seconds */
const TARGET_WAIT = .5;
/** a gem that does not fly fades in this long, ms */
const CANCEL_FADE = 150;
const IDLE_SPIN = 2 * Math.PI / 26;
const FLIGHT_SPIN = 5;

export function flyWalletGemIntoChat(launch: AmountSceneLaunch, randomId: string) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = `position:fixed;left:0;top:0;width:${FLY_CANVAS}px;height:${FLY_CANVAS}px;pointer-events:none;z-index:100`;

  let gem: GemView;
  try {
    gem = new GemView(canvas, {appearance: Appearance.blue, swayScale: 1.6, lightBackground: true});
  } catch(err) {
    // * no WebGL2: the card shows the transfer without the flight
    return false;
  }

  gem.setSize(FLY_CANVAS, pixelRatio());
  gem.adopt(launch.gem);
  gem.style.widthPoints = launch.width;
  gem.style.rotationSpeed = launch.spin;
  // * over the window the app is in: the tab, or its Document PiP window
  getOverlayRoot().append(canvas);

  const [fromX, fromY] = launch.from;
  const place = (x: number, y: number) => canvas.style.transform = `translate(${x - FLY_CANVAS / 2}px, ${y - FLY_CANVAS / 2}px)`;
  place(fromX, fromY);

  let created: number, started: number, target: WalletChatCardTarget, finished = false;
  const finish = () => {
    finished = true;
    detach();
    gem.destroy();
  };

  const cancel = () => {
    if(finished) return;
    finish();
    target?.await(false);
    canvas.animate({opacity: [1, 0]}, {duration: CANCEL_FADE}).finished.finally(() => canvas.remove());
  };

  const land = () => {
    finish();
    canvas.remove();
    target.land();
  };

  const frame = (now: number) => {
    created ??= now;
    if(!target) {
      target = getWalletChatCardTarget(randomId);
      target?.await(true);
    }

    // * the one read of the frame, before its writes
    const slot = target?.slot();
    const win = getAppWindow();
    const inView = slot && slot.x >= 0 && slot.y >= 0 && slot.x <= win.innerWidth && slot.y <= win.innerHeight;
    if(!inView) {
      if(started !== undefined || now - created >= TARGET_WAIT) {
        cancel();
        return;
      }

      // * waiting for the card where the amount screen left it, still spinning
      gem.render(now);
      return;
    }

    started ??= now;
    const t = Math.min(1, (now - started) / FLIGHT);
    const [x, y] = toss([fromX, fromY], [slot.x, slot.y], APEX, t);
    place(x, y);
    // * it swells at the top of the throw, as if it flew closer
    gem.style.widthPoints = (launch.width + (slot.width - launch.width) * t) * (1 + .28 * Math.sin(Math.PI * Math.min(1, t / .75)));
    gem.style.rotationSpeed = IDLE_SPIN + (FLIGHT_SPIN - IDLE_SPIN) * Math.min(1, t / .6);
    gem.style.appearance = t > .5 ? Appearance.cool : Appearance.blue;
    gem.render(now);
    if(t >= 1) {
      land();
    }
  };

  const detach = addWalletFrameClient({
    frame,
    isVisible: () => true,
    isBusy: () => true,
    // * the page went away mid-flight: nothing of it waits for the return
    onHidden: cancel
  });

  return true;
}
