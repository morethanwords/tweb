/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import cancelEvent from '../helpers/dom/cancelEvent';
import {simulateClickEvent, attachClickEvent} from '../helpers/dom/clickEvent';
import findUpAsChild from '../helpers/dom/findUpAsChild';
import findUpClassName from '../helpers/dom/findUpClassName';
import getVisibleRect from '../helpers/dom/getVisibleRect';
import ListenerSetter from '../helpers/listenerSetter';
import {makeMediaSize} from '../helpers/mediaSize';
import {getMiddleware} from '../helpers/middleware';
import {doubleRaf} from '../helpers/schedulers';
import pause from '../helpers/schedulers/pause';
import windowSize from '../helpers/windowSize';
import {MyDocument} from '../lib/appManagers/appDocsManager';
import getStickerEffectThumb from '../lib/appManagers/utils/stickers/getStickerEffectThumb';
import wrapEmojiText from '../lib/richTextProcessor/wrapEmojiText';
import lottieLoader from '../lib/rlottie/lottieLoader';
import RLottiePlayer from '../lib/rlottie/rlottiePlayer';
import rootScope from '../lib/rootScope';
import animationIntersector, {AnimationItemGroup} from './animationIntersector';
import SetTransition from './singleTransition';
import {wrapSticker} from './wrappers';
import {STICKER_EFFECT_MULTIPLIER} from './wrappers/sticker';

let hasViewer = false;
export default function attachStickerViewerListeners({listenTo, listenerSetter}: {
  listenerSetter: ListenerSetter,
  listenTo: HTMLElement
}) {
  if(IS_TOUCH_SUPPORTED) {
    return;
  }

  const managers = rootScope.managers;
  const findClassName = 'media-sticker-wrapper';

  listenerSetter.add(listenTo)('mousedown', (e) => {
    if(hasViewer || e.buttons > 1 || e.button !== 0) return;
    let mediaContainer = findUpClassName(e.target, findClassName);
    if(!mediaContainer) {
      return;
    }

    // const img: HTMLImageElement = mediaContainer.querySelector('img.media-sticker');

    const docId = mediaContainer.dataset.docId;
    if(!docId) {
      return;
    }

    const className = 'sticker-viewer';
    const group: AnimationItemGroup = 'STICKER-VIEWER';
    const openDuration = 200;
    const switchDuration = 200;
    const previousGroup = animationIntersector.getOnlyOnePlayableGroup();
    const _middleware = getMiddleware();
    let container: HTMLElement, previousTransformer: HTMLElement;

    const doThatSticker = async({mediaContainer, doc, middleware, lockGroups, isSwitching}: {
      mediaContainer: HTMLElement,
      doc: MyDocument,
      middleware: () => boolean,
      lockGroups?: boolean,
      isSwitching?: boolean
    }) => {
      const effectThumb = getStickerEffectThumb(doc);
      const mediaRect: DOMRect = mediaContainer.getBoundingClientRect();
      const s = makeMediaSize(doc.w, doc.h);
      const size = effectThumb ? 280 : 360;
      const boxSize = makeMediaSize(size, size);
      const fitted = mediaRect.width === mediaRect.height ? boxSize : s.aspectFitted(boxSize);

      const bubble = findUpClassName(mediaContainer, 'bubble');
      const isOut = bubble ? bubble.classList.contains('is-out') : true;

      const transformer = document.createElement('div');
      transformer.classList.add(className + '-transformer');

      const stickerContainer = document.createElement('div');
      stickerContainer.classList.add(className + '-sticker');
      /* transformer.style.width =  */stickerContainer.style.width = fitted.width + 'px';
      /* transformer.style.height =  */stickerContainer.style.height = fitted.height + 'px';

      const stickerEmoji = document.createElement('div');
      stickerEmoji.classList.add(className + '-emoji');
      stickerEmoji.append(wrapEmojiText(doc.stickerEmojiRaw));

      if(effectThumb) {
        const margin = (size * STICKER_EFFECT_MULTIPLIER - size) / 3 * (isOut ? 1 : -1);
        transformer.classList.add('has-effect');
        // const property = `--margin-${isOut ? 'right' : 'left'}`;
        // stickerContainer.style.setProperty(property, `${margin * 2}px`);
        transformer.style.setProperty('--translateX', `${margin}px`);
        stickerEmoji.style.setProperty('--translateX', `${-margin}px`);
      }

      const overflowElement = findUpClassName(mediaContainer, 'scrollable');
      const visibleRect = getVisibleRect(mediaContainer, overflowElement, true, mediaRect);
      if(visibleRect.overflow.vertical || visibleRect.overflow.horizontal) {
        stickerContainer.classList.add('is-overflow');
      }

      // if(img) {
      //   const ratio = img.naturalWidth / img.naturalHeight;
      //   if((mediaRect.width / mediaRect.height).toFixed(1) !== ratio.toFixed(1)) {

      //     mediaRect = mediaRect.toJSON();
      //   }
      // }

      const rect = mediaContainer.getBoundingClientRect();
      const scaleX = rect.width / fitted.width;
      const scaleY = rect.height / fitted.height;
      const transformX = rect.left - (windowSize.width - rect.width) / 2;
      const transformY = rect.top - (windowSize.height - rect.height) / 2;
      transformer.style.transform = `translate(${transformX}px, ${transformY}px) scale(${scaleX}, ${scaleY})`;
      if(isSwitching) transformer.classList.add('is-switching');
      transformer.append(stickerContainer, stickerEmoji);
      container.append(transformer);

      const player = await wrapSticker({
        doc,
        div: stickerContainer,
        group,
        width: fitted.width,
        height: fitted.height,
        play: false,
        loop: true,
        middleware,
        managers,
        needFadeIn: false,
        isOut,
        withThumb: false,
        relativeEffect: true,
        loopEffect: true
      }).then(({render}) => render);
      if(!middleware()) return;

      if(!container.parentElement) {
        document.body.append(container);
      }

      const firstFramePromise = player instanceof RLottiePlayer ?
        new Promise<void>((resolve) => player.addEventListener('firstFrame', resolve, {once: true})) :
        Promise.resolve();
      await Promise.all([firstFramePromise, doubleRaf()]);
      await pause(0); // ! need it because firstFrame will be called just from the loop
      if(!middleware()) return;

      if(lockGroups) {
        animationIntersector.setOnlyOnePlayableGroup(group);
        animationIntersector.checkAnimations(true);
      }

      if(player instanceof RLottiePlayer) {
        const prevPlayer = lottieLoader.getAnimation(mediaContainer);
        player.curFrame = prevPlayer.curFrame;
        player.play();
        await new Promise<void>((resolve) => {
          let i = 0;
          const c = () => {
            if(++i === 2) {
              resolve();
              player.removeEventListener('enterFrame', c);
            }
          };

          player.addEventListener('enterFrame', c);
        });
        player.pause();
      } else if(player instanceof HTMLVideoElement) {
        player.currentTime = (mediaContainer.querySelector('video') as HTMLVideoElement).currentTime;
      }

      return {
        ready: () => {
          if(player instanceof RLottiePlayer || player instanceof HTMLVideoElement) {
            player.play();
          }

          if(effectThumb) {
            simulateClickEvent(stickerContainer);
          }
        },
        transformer
      };
    };

    const timeout = window.setTimeout(async() => {
      document.removeEventListener('mousemove', onMousePreMove);

      container = document.createElement('div');
      container.classList.add(className);
      hasViewer = true;

      const middleware = _middleware.get();
      const doc = await managers.appDocsManager.getDoc(docId);
      if(!middleware()) return;

      let result: Awaited<ReturnType<typeof doThatSticker>>;
      try {
        result = await doThatSticker({
          doc,
          mediaContainer,
          middleware,
          lockGroups: true
        });
        if(!result) return;
      } catch(err) {
        return;
      }

      const {ready, transformer} = result;

      previousTransformer = transformer;

      SetTransition(container, 'is-visible', true, openDuration, () => {
        if(!middleware()) return;
        ready();
      });

      document.addEventListener('mousemove', onMouseMove);
    }, 125);

    const onMouseMove = async(e: MouseEvent) => {
      const newMediaContainer = findUpClassName(e.target, 'media-sticker-wrapper');
      if(!newMediaContainer || mediaContainer === newMediaContainer) {
        return;
      }

      const docId = newMediaContainer.dataset.docId;
      if(!docId) {
        return;
      }

      mediaContainer = newMediaContainer;
      _middleware.clean();
      const middleware = _middleware.get();

      const doc = await managers.appDocsManager.getDoc(docId);
      if(!middleware()) return;

      let r: Awaited<ReturnType<typeof doThatSticker>>;
      try {
        r = await doThatSticker({
          doc,
          mediaContainer,
          middleware,
          isSwitching: true
        });
        if(!r) return;
      } catch(err) {
        return;
      }

      const {ready, transformer} = r;

      const _previousTransformer = previousTransformer;
      SetTransition(_previousTransformer, 'is-switching', true, switchDuration, () => {
        _previousTransformer.remove();
      });

      previousTransformer = transformer;

      SetTransition(transformer, 'is-switching', false, switchDuration, () => {
        if(!middleware()) return;
        ready();
      });
    };

    const onMousePreMove = (e: MouseEvent) => {
      if(!findUpAsChild(e.target as HTMLElement, mediaContainer)) {
        document.removeEventListener('mousemove', onMousePreMove);
        onMouseUp();
      }
    };

    const onMouseUp = () => {
      clearTimeout(timeout);
      _middleware.clean();

      if(container) {
        SetTransition(container, 'is-visible', false, openDuration, () => {
          container.remove();
          animationIntersector.setOnlyOnePlayableGroup(previousGroup);
          animationIntersector.checkAnimations(false);
          hasViewer = false;
        });

        attachClickEvent(document.body, cancelEvent, {capture: true, once: true});
      }

      document.removeEventListener('mousemove', onMouseMove);
    };

    document.addEventListener('mousemove', onMousePreMove);
    document.addEventListener('mouseup', onMouseUp, {once: true});
  });
}
