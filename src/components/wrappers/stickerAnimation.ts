/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../../lib/appManagers/appDocsManager';
import IS_VIBRATE_SUPPORTED from '../../environment/vibrateSupport';
import assumeType from '../../helpers/assumeType';
import isInDOM from '../../helpers/dom/isInDOM';
import makeError from '../../helpers/makeError';
import {getMiddleware, Middleware} from '../../helpers/middleware';
import throttleWithRaf from '../../helpers/schedulers/throttleWithRaf';
import windowSize from '../../helpers/windowSize';
import {PhotoSize, VideoSize} from '../../layer';
import {AppManagers} from '../../lib/appManagers/managers';
import RLottiePlayer from '../../lib/rlottie/rlottiePlayer';
import Scrollable from '../scrollable';
import wrapSticker from './sticker';

export const emojiAnimationContainer = document.createElement('div');
emojiAnimationContainer.classList.add('emoji-animation-container');

const NO_UNMOUNT = false;

export default function wrapStickerAnimation({
  size,
  stickerSize,
  doc,
  middleware,
  target,
  side,
  skipRatio,
  play,
  managers,
  fullThumb,
  withRandomOffset,
  relativeEffect,
  loopEffect,
  onUnmount,
  scrollable,
  textColor,
  addOffsetX: _addOffsetX = 0,
  addOffsetY: _addOffsetY = 0
}: {
  size: number,
  stickerSize?: number,
  doc: MyDocument,
  middleware?: Middleware,
  target: HTMLElement,
  side: 'left' | 'center' | 'right',
  skipRatio?: number,
  play: boolean,
  managers?: AppManagers,
  fullThumb?: PhotoSize | Extract<VideoSize, VideoSize.videoSize>,
  withRandomOffset?: boolean,
  relativeEffect?: boolean,
  loopEffect?: boolean,
  onUnmount?: () => void,
  scrollable?: Scrollable,
  textColor?: string,
  addOffsetX?: number,
  addOffsetY?: number
}) {
  const animationDiv = document.createElement('div');
  animationDiv.classList.add('emoji-animation');

  // const size = 280;
  animationDiv.style.width = size + 'px';
  animationDiv.style.height = size + 'px';

  let animation: RLottiePlayer;
  const unmountAnimation = () => {
    if(NO_UNMOUNT) {
      return;
    }

    middlewareHelper.destroy();
    const a = animation;
    animation = undefined;
    a?.remove();
    animationDiv.remove();
    onScroll && scrollable.container.removeEventListener('scroll', onScroll);
    if(a) {
      onUnmount?.();
    }
  };

  const middlewareHelper = middleware?.create() ?? getMiddleware();
  middleware = middlewareHelper.get();

  const stickerPromise = wrapSticker({
    div: animationDiv,
    doc,
    middleware,
    withThumb: false,
    needFadeIn: false,
    loop: !!loopEffect,
    width: stickerSize || size,
    height: stickerSize || size,
    play,
    group: 'none',
    skipRatio,
    managers,
    fullThumb,
    isEffect: true,
    textColor
  }).then(({render}) => render).then((_animation) => {
    assumeType<RLottiePlayer>(_animation);
    if(!middleware()) {
      _animation.remove();
      throw makeError('MIDDLEWARE');
    }

    animation = _animation;
    animation.addEventListener('enterFrame', (frameNo) => {
      if((!loopEffect && frameNo === animation.maxFrame) || !isInDOM(target)) {
        unmountAnimation();
      }
    });

    animation.addEventListener('destroy', unmountAnimation);

    if(IS_VIBRATE_SUPPORTED) {
      animation.addEventListener('firstFrame', () => {
        navigator.vibrate(100);
      }, {once: true});
    }

    animation.addEventListener('firstFrame', () => {
      setPosition();
    }, {once: true});

    return animation;
  });

  const generateRandomSigned = (max: number) => {
    const r = Math.random() * max * 2;
    return r > max ? -r % max : r;
  };

  const randomOffsetX = withRandomOffset ? generateRandomSigned(16) : 0;
  const randomOffsetY = withRandomOffset ? generateRandomSigned(4) : 0;
  const setPosition = () => {
    if(!isInDOM(target)) {
      unmountAnimation();
      return;
    }

    const rect = target.getBoundingClientRect();

    const factor = rect.width / 200;
    const stableOffsetX = side === 'center' ? 0 : 16 * (side === 'right' ? 1 : -1) * factor;
    // const stableOffsetY = side === 'center' ? 0 : -50 * factor;
    const stableOffsetY = side === 'center' ? 0 : 0 * factor;

    const rectX = side === 'right' ? rect.right : rect.left;
    const rectY = rect.top;

    const addOffsetX = (side === 'center' ? (rect.width - size) / 2 : (side === 'right' ? -size : 0)) + stableOffsetX + randomOffsetX + _addOffsetX * (side === 'right' ? 1 : -1);
    const addOffsetY = (side === 'center' || true ? (rect.height - size) / 2 : 0) + stableOffsetY + randomOffsetY + _addOffsetY;
    const x = rectX + addOffsetX;
    const y = rectY + addOffsetY;

    if(y <= -size || y >= windowSize.height) {
      unmountAnimation();
      return;
    }

    if(relativeEffect) {
      if(side !== 'center') animationDiv.style[side] = Math.abs(stableOffsetX) * -1 + 'px';
      else animationDiv.style.left = addOffsetX + 'px';
      animationDiv.style.top = addOffsetY + 'px';
    } else {
      animationDiv.style.top = y + 'px';
      animationDiv.style.left = x + 'px';
    }
  };

  let onScroll: () => void;
  if(scrollable) {
    onScroll = throttleWithRaf(setPosition);
    scrollable.container.addEventListener('scroll', onScroll);
  }

  // setPosition();

  if(relativeEffect) {
    animationDiv.classList.add('is-relative');
    target.parentElement.append(animationDiv);
  } else {
    emojiAnimationContainer.append(animationDiv);
  }

  return {animationDiv, stickerPromise};
}
