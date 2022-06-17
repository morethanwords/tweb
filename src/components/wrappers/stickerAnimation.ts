/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_VIBRATE_SUPPORTED from "../../environment/vibrateSupport";
import assumeType from "../../helpers/assumeType";
import isInDOM from "../../helpers/dom/isInDOM";
import throttleWithRaf from "../../helpers/schedulers/throttleWithRaf";
import { MyDocument } from "../../lib/appManagers/appDocsManager";
import appImManager from "../../lib/appManagers/appImManager";
import { AppManagers } from "../../lib/appManagers/managers";
import RLottiePlayer from "../../lib/rlottie/rlottiePlayer";
import wrapSticker from "./sticker";

export default function wrapStickerAnimation({
  size,
  doc,
  middleware,
  target,
  side,
  skipRatio,
  play,
  managers
}: {
  size: number,
  doc: MyDocument,
  middleware?: () => boolean,
  target: HTMLElement,
  side: 'left' | 'center' | 'right',
  skipRatio?: number,
  play: boolean,
  managers?: AppManagers
}) {
  const animationDiv = document.createElement('div');
  animationDiv.classList.add('emoji-animation');

  // const size = 280;
  animationDiv.style.width = size + 'px';
  animationDiv.style.height = size + 'px';

  const stickerPromise = wrapSticker({
    div: animationDiv,
    doc,
    middleware,
    withThumb: false,
    needFadeIn: false,
    loop: false,
    width: size,
    height: size,
    play,
    group: 'none',
    skipRatio,
    managers
  }).then(({render}) => render).then((animation) => {
    assumeType<RLottiePlayer>(animation);
    animation.addEventListener('enterFrame', (frameNo) => {
      if(frameNo === animation.maxFrame) {
        animation.remove();
        animationDiv.remove();
        appImManager.chat.bubbles.scrollable.container.removeEventListener('scroll', onScroll);
      }
    });

    if(IS_VIBRATE_SUPPORTED) {
      animation.addEventListener('firstFrame', () => {
        navigator.vibrate(100);
      }, {once: true});
    }

    return animation;
  });

  const generateRandomSigned = (max: number) => {
    const r = Math.random() * max * 2;
    return r > max ? -r % max : r;
  };

  const randomOffsetX = generateRandomSigned(16);
  const randomOffsetY = generateRandomSigned(4);
  const stableOffsetX = size / 8 * (side === 'right' ? 1 : -1);
  const setPosition = () => {
    if(!isInDOM(target)) {
      return;
    }
    
    const rect = target.getBoundingClientRect();
    /* const boxWidth = Math.max(rect.width, rect.height);
    const boxHeight = Math.max(rect.width, rect.height);
    const x = rect.left + ((boxWidth - size) / 2);
    const y = rect.top + ((boxHeight - size) / 2); */

    const rectX = side === 'right' ? rect.right : rect.left;

    const addOffsetX = side === 'center' ? (rect.width - size) / 2 : (side === 'right' ? -size : 0) + stableOffsetX + randomOffsetX;
    const x = rectX + addOffsetX;
    // const y = rect.bottom - size + size / 4;
    const y = rect.top + ((rect.height - size) / 2) + (side === 'center' ? 0 : randomOffsetY);
    // animationDiv.style.transform = `translate(${x}px, ${y}px)`;
    animationDiv.style.top = y + 'px';
    animationDiv.style.left = x + 'px';
  };

  const onScroll = throttleWithRaf(setPosition);

  appImManager.chat.bubbles.scrollable.container.addEventListener('scroll', onScroll);

  setPosition();

  appImManager.emojiAnimationContainer.append(animationDiv);

  return {animationDiv, stickerPromise};
}
