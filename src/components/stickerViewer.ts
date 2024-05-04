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
import safePlay from '../helpers/dom/safePlay';
import ListenerSetter from '../helpers/listenerSetter';
import {makeMediaSize} from '../helpers/mediaSize';
import {getMiddleware, Middleware} from '../helpers/middleware';
import {doubleRaf} from '../helpers/schedulers';
import pause from '../helpers/schedulers/pause';
import windowSize from '../helpers/windowSize';
import {DocumentAttribute} from '../layer';
import {MyDocument} from '../lib/appManagers/appDocsManager';
import getStickerEffectThumb from '../lib/appManagers/utils/stickers/getStickerEffectThumb';
import CustomEmojiElement from '../lib/customEmoji/element';
import wrapEmojiText from '../lib/richTextProcessor/wrapEmojiText';
import lottieLoader from '../lib/rlottie/lottieLoader';
import RLottiePlayer from '../lib/rlottie/rlottiePlayer';
import rootScope from '../lib/rootScope';
import animationIntersector, {AnimationItemGroup} from './animationIntersector';
import {EMOJI_TEXT_COLOR} from './emoticonsDropdown';
import SetTransition from './singleTransition';
import wrapSticker from './wrappers/sticker';
import {STICKER_EFFECT_MULTIPLIER} from './wrappers/sticker';
import wrapVideo from './wrappers/video';

let hasViewer = false;
export default function attachStickerViewerListeners({listenTo, listenerSetter, selector, findTarget: originalFindTarget, getTextColor}: {
  listenerSetter: ListenerSetter,
  listenTo: HTMLElement,
  selector?: string,
  findTarget?: (e: MouseEvent) => HTMLElement,
  getTextColor?: () => string
}) {
  if(IS_TOUCH_SUPPORTED) {
    return;
  }

  const findTarget = (e: MouseEvent, checkForParent?: boolean) => {
    let el: HTMLElement;
    if(originalFindTarget) el = originalFindTarget(e);
    else {
      const s = selector || '.media-sticker-wrapper, .media-gif-wrapper';
      el = (e.target as HTMLElement).closest(s) as HTMLElement;
    }

    return el && (!checkForParent || findUpAsChild(el, listenTo)) ? el : undefined;
  };

  const managers = rootScope.managers;

  listenerSetter.add(listenTo)('mousedown', (e) => {
    if(hasViewer || e.buttons > 1 || e.button !== 0) return;
    let mediaContainer = findTarget(e);
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
    let container: HTMLElement,
      previousTransformer: HTMLElement,
      isMouseUp = false;

    const doThatSticker = async({mediaContainer, doc, middleware, lockGroups, isSwitching}: {
      mediaContainer: HTMLElement,
      doc: MyDocument,
      middleware: Middleware,
      lockGroups?: boolean,
      isSwitching?: boolean
    }) => {
      const isGif = doc.type === 'gif';
      const effectThumb = isGif ? undefined : getStickerEffectThumb(doc);
      const mediaRect: DOMRect = mediaContainer.getBoundingClientRect();
      const s = makeMediaSize(doc.w, doc.h);
      const size = effectThumb ? 280 : (isGif ? Math.min(480, windowSize.height - 200) : 360);
      const boxSize = makeMediaSize(size, size);
      const fitted = mediaRect.width === mediaRect.height ? boxSize : s.aspectFitted(boxSize);

      const bubble = findUpClassName(mediaContainer, 'bubble');
      const isOut = bubble ? bubble.classList.contains('is-out') : true;

      const transformer = document.createElement('div');
      transformer.classList.add(className + '-transformer');
      transformer.middlewareHelper = middleware.create();
      middleware = transformer.middlewareHelper.get();

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

      const attribute = doc.attributes.find((attribute) => attribute._ === 'documentAttributeCustomEmoji') as DocumentAttribute.documentAttributeCustomEmoji;

      const o = isGif ? await wrapVideo({
        doc,
        container: stickerContainer,
        group,
        boxWidth: fitted.width,
        boxHeight: fitted.height,
        canAutoplay: true,
        middleware,
        noInfo: true
        // noPreview: true
      }).then(async(res) => (await res.loadPromise, res.video)) : await wrapSticker({
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
        loopEffect: true,
        textColor: attribute && attribute.pFlags.text_color ? getTextColor?.() || EMOJI_TEXT_COLOR : undefined
      }).then(({render}) => render);
      if(!middleware()) return;

      if(!container.parentElement) {
        document.body.append(container);
      }

      const player = Array.isArray(o) ? o[0] : o;

      const firstFramePromise = player instanceof RLottiePlayer ?
        new Promise<void>((resolve) => player.addEventListener('firstFrame', resolve, {once: true})) :
        Promise.resolve();
      await Promise.all([firstFramePromise, doubleRaf()]);
      await pause(0); // ! need it because firstFrame will be called just from the loop
      if(!middleware()) return;

      if(lockGroups) {
        animationIntersector.setOnlyOnePlayableGroup(group);
        animationIntersector.checkAnimations2(true);
      }

      if(player instanceof RLottiePlayer) {
        const prevPlayer = mediaContainer instanceof CustomEmojiElement ?
          mediaContainer.player as RLottiePlayer :
          lottieLoader.getAnimation(mediaContainer);
        if(prevPlayer) {
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
          if(!middleware()) return;
          player.pause();
        }
      } else if(player instanceof HTMLVideoElement) {
        const prevPlayer = mediaContainer.querySelector<HTMLVideoElement>('video');
        if(prevPlayer) {
          player.currentTime = prevPlayer.currentTime;
        }
      }

      return {
        ready: () => {
          if(player instanceof RLottiePlayer || player instanceof HTMLVideoElement) {
            safePlay(player);
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

      // * can't use middleware here
      if(isMouseUp) {
        return;
      }

      const {ready, transformer} = result;

      previousTransformer = transformer;

      SetTransition({
        element: container,
        className: 'is-visible',
        forwards: true,
        duration: openDuration,
        onTransitionEnd: () => {
          if(!middleware()) return;
          ready();
        }
      });

      document.addEventListener('mousemove', onMouseMove);
    }, 125);

    const onMouseMove = async(e: MouseEvent) => {
      const newMediaContainer = findTarget(e, true);
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
        console.error('sticker viewer error', err);
        return;
      }

      const {ready, transformer} = r;

      const _previousTransformer = previousTransformer;
      SetTransition({
        element: _previousTransformer,
        className: 'is-switching',
        forwards: true,
        duration: switchDuration,
        onTransitionEnd: () => {
          _previousTransformer.remove();
          _previousTransformer.middlewareHelper.destroy();
        }
      });

      previousTransformer = transformer;

      SetTransition({
        element: transformer,
        className: 'is-switching',
        forwards: false,
        duration: switchDuration,
        onTransitionEnd: () => {
          if(!middleware()) return;
          ready();
        }
      });
    };

    const onMousePreMove = (e: MouseEvent) => {
      if(!findUpAsChild(e.target as HTMLElement, mediaContainer)) {
        onMouseUp();
      }
    };

    const onMouseUp = () => {
      isMouseUp = true;
      clearTimeout(timeout);
      // _middleware.clean();

      if(container) {
        SetTransition({
          element: container,
          className: 'is-visible',
          forwards: false,
          duration: openDuration,
          onTransitionEnd: () => {
            container.remove();
            animationIntersector.setOnlyOnePlayableGroup(previousGroup);
            animationIntersector.checkAnimations2(false);
            _middleware.destroy();
            hasViewer = false;
          }
        });

        attachClickEvent(document.body, cancelEvent, {capture: true, once: true});
      }

      document.removeEventListener('mousemove', onMousePreMove);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp, {capture: true});
    };

    document.addEventListener('mousemove', onMousePreMove);
    document.addEventListener('mouseup', onMouseUp, {once: true, capture: true});
  });
}
