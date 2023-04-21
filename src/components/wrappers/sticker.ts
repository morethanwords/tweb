/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_WEBP_SUPPORTED from '../../environment/webpSupport';
import assumeType from '../../helpers/assumeType';
import getPathFromBytes from '../../helpers/bytes/getPathFromBytes';
import deferredPromise from '../../helpers/cancellablePromise';
import computeLockColor from '../../helpers/computeLockColor';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import createVideo from '../../helpers/dom/createVideo';
import findUpClassName from '../../helpers/dom/findUpClassName';
import renderImageFromUrl, {renderImageFromUrlPromise} from '../../helpers/dom/renderImageFromUrl';
import getImageFromStrippedThumb from '../../helpers/getImageFromStrippedThumb';
import getPreviewURLFromThumb from '../../helpers/getPreviewURLFromThumb';
import makeError from '../../helpers/makeError';
import {makeMediaSize} from '../../helpers/mediaSize';
import mediaSizes from '../../helpers/mediaSizes';
import {Middleware} from '../../helpers/middleware';
import onMediaLoad from '../../helpers/onMediaLoad';
import {isSavingLottiePreview, saveLottiePreview} from '../../helpers/saveLottiePreview';
import throttle from '../../helpers/schedulers/throttle';
import sequentialDom from '../../helpers/sequentialDom';
import {DocumentAttribute, PhotoSize, VideoSize} from '../../layer';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import appDownloadManager from '../../lib/appManagers/appDownloadManager';
import appImManager from '../../lib/appManagers/appImManager';
import {AppManagers} from '../../lib/appManagers/managers';
import getServerMessageId from '../../lib/appManagers/utils/messageId/getServerMessageId';
import choosePhotoSize from '../../lib/appManagers/utils/photos/choosePhotoSize';
import getStickerEffectThumb from '../../lib/appManagers/utils/stickers/getStickerEffectThumb';
import lottieLoader from '../../lib/rlottie/lottieLoader';
import type RLottiePlayer from '../../lib/rlottie/rlottiePlayer';
import rootScope from '../../lib/rootScope';
import type {ThumbCache} from '../../lib/storages/thumbs';
import webpWorkerController from '../../lib/webp/webpWorkerController';
import {Awaited, SendMessageEmojiInteractionData} from '../../types';
import {getEmojiToneIndex} from '../../vendor/emoji';
import animationIntersector, {AnimationItemGroup} from '../animationIntersector';
import LazyLoadQueue from '../lazyLoadQueue';
import PopupStickers from '../popups/stickers';
import {hideToast, toastNew} from '../toast';
import wrapStickerAnimation from './stickerAnimation';
import framesCache from '../../helpers/framesCache';
import {IS_MOBILE} from '../../environment/userAgent';
import liteMode, {LiteModeKey} from '../../helpers/liteMode';
import PopupElement from '../popups';

// https://github.com/telegramdesktop/tdesktop/blob/master/Telegram/SourceFiles/history/view/media/history_view_sticker.cpp#L40
export const STICKER_EFFECT_MULTIPLIER = 1 + 0.245 * 2;
const EMOJI_EFFECT_MULTIPLIER = 3;

const locksUrls: {[docId: string]: string} = {};

export const videosCache: {[key: string]: Promise<any>} = {};

const onAnimationEnd = (element: HTMLElement, onAnimationEnd: () => void, timeout: number) => {
  const onEnd = () => {
    element.removeEventListener('animationend', onEnd);
    onAnimationEnd();
    clearTimeout(_timeout);
  };
  element.addEventListener('animationend', onEnd);
  const _timeout = setTimeout(onEnd, timeout);
};

export default async function wrapSticker({doc, div, middleware, loadStickerMiddleware, lazyLoadQueue, exportLoad, group, play, onlyThumb, emoji, width, height, withThumb, loop, loadPromises, needFadeIn, needUpscale, skipRatio, static: asStatic, managers = rootScope.managers, fullThumb, isOut, noPremium, withLock, relativeEffect, loopEffect, isCustomEmoji, syncedVideo, liteModeKey, isEffect, textColor}: {
  doc: MyDocument,
  div: HTMLElement | HTMLElement[],
  middleware?: Middleware,
  loadStickerMiddleware?: Middleware,
  lazyLoadQueue?: LazyLoadQueue,
  exportLoad?: number,
  group?: AnimationItemGroup,
  play?: boolean,
  onlyThumb?: boolean,
  emoji?: string,
  width?: number,
  height?: number,
  withThumb?: boolean,
  loop?: RLottiePlayer['loop'],
  loadPromises?: Promise<any>[],
  needFadeIn?: boolean,
  needUpscale?: boolean,
  skipRatio?: number,
  static?: boolean,
  managers?: AppManagers,
  fullThumb?: PhotoSize | Extract<VideoSize, VideoSize.videoSize>,
  isOut?: boolean,
  noPremium?: boolean,
  withLock?: boolean,
  relativeEffect?: boolean,
  loopEffect?: boolean,
  isCustomEmoji?: boolean,
  syncedVideo?: boolean,
  liteModeKey?: LiteModeKey | false,
  isEffect?: boolean,
  textColor?: WrapSomethingOptions['textColor']
}) {
  div = Array.isArray(div) ? div : [div];

  liteModeKey ??= 'stickers_panel';

  if(isCustomEmoji) {
    emoji = doc.stickerEmojiRaw;
  }

  const stickerType = doc.sticker;
  if(stickerType === 1) {
    asStatic = true;
  }

  if(!width && !height) {
    const sizes = mediaSizes.active;
    const boxSize = emoji ? sizes.emojiSticker : (doc.animated ? sizes.animatedSticker : sizes.staticSticker);
    const size = makeMediaSize(doc.w, doc.h).aspectFitted(boxSize);
    width = size.width;
    height = size.height;
  }

  if(stickerType === 2) {
    // LottieLoader.loadLottie();
    lottieLoader.loadLottieWorkers();
  }

  loop = !!(!emoji || isCustomEmoji) && loop;

  div.forEach((div) => {
    div.dataset.docId = '' + doc.id;
    if(emoji) {
      div.dataset.stickerEmoji = emoji;
    }

    div.dataset.stickerPlay = '' + +(play || false);
    div.dataset.stickerLoop = '' + +(loop || false);

    div.classList.add('media-sticker-wrapper');
  });

  if(play && liteModeKey && !liteMode.isAvailable(liteModeKey) && !isCustomEmoji && !isEffect) {
    play = false;
    loop = false;
  }

  /* if(stickerType === 3) {
    const videoRes = wrapVideo({
      doc,
      boxWidth: width,
      boxHeight: height,
      container: div,
      group,
      lazyLoadQueue,
      middleware,
      withoutPreloader: true,
      loadPromises,
      noPlayButton: true,
      noInfo: true
    });

    if(videoRes.thumb) {
      if(videoRes.thumb.images.thumb) {
        videoRes.thumb.images.thumb.classList.add('media-sticker', 'thumbnail');
      }

      if(videoRes.thumb.images.full) {
        videoRes.thumb.images.full.classList.add('media-sticker');
      }
    }

    return videoRes.loadPromise;
  } */

  // console.log('wrap sticker', doc, div, onlyThumb);

  let cacheContext: ThumbCache;
  const getCacheContext = async(type: string = cacheContext?.type) => {
    return cacheContext = await managers.thumbsStorage.getCacheContext(doc, type);
  };

  const isAnimated = !asStatic && (stickerType === 2 || stickerType === 3);

  const effectThumb = getStickerEffectThumb(doc);
  if(isOut !== undefined && effectThumb && !isOut) {
    div.forEach((div) => div.classList.add('reflect-x'));
  }

  const willHaveLock = effectThumb && withLock;
  if(willHaveLock) {
    const lockUrl = locksUrls[doc.id];
    div.forEach((div) => {
      div.classList.add('is-premium-sticker', 'tgico-premium_lock');
      lockUrl && div.style.setProperty('--lock-url', `url(${lockUrl})`);
    });
  }

  if(asStatic && stickerType !== 1) {
    const thumb = choosePhotoSize(doc, width, height, false) as PhotoSize.photoSize;
    await getCacheContext(thumb.type);
  } else {
    await getCacheContext(fullThumb?.type);
  }

  const customEmojiAttribute = doc.attributes.find((attribute) => attribute._ === 'documentAttributeCustomEmoji') as DocumentAttribute.documentAttributeCustomEmoji;
  if(!customEmojiAttribute || !customEmojiAttribute.pFlags.text_color) {
    textColor = undefined;
  } else if(!textColor) {
    textColor = 'primary-text-color';
  }

  const toneIndex = emoji && !isCustomEmoji ? getEmojiToneIndex(emoji) : -1;
  const lottieCachedThumbToneIndex = toneIndex === -1 ? textColor ?? toneIndex : toneIndex;
  const downloaded = cacheContext.downloaded && !needFadeIn;

  const isThumbNeededForType = isAnimated;
  const lottieCachedThumb = stickerType === 2 || stickerType === 3 ? await managers.appDocsManager.getLottieCachedThumb(doc.id, lottieCachedThumbToneIndex) : undefined;

  const ret = {render: undefined as typeof loadPromise, load: undefined as typeof load};
  let loadThumbPromise = deferredPromise<void>();
  let haveThumbCached = false;
  if((
    doc.thumbs?.length ||
      lottieCachedThumb
  ) &&
    !div[0].firstElementChild && (
    !downloaded ||
      isThumbNeededForType ||
      onlyThumb
  ) && withThumb !== false/*  && doc.thumbs[0]._ !== 'photoSizeEmpty' */
  ) {
    let thumb = lottieCachedThumb || doc.thumbs[0];

    // console.log('wrap sticker', thumb, div);

    const afterRender = (div: HTMLElement, thumbImage: HTMLElement) => {
      if(!div.childElementCount) {
        sequentialDom.mutateElement(div, () => {
          if(!div.childElementCount) {
            thumbImage.classList.add('media-sticker', 'thumbnail');
            div.append(thumbImage);
          }

          loadThumbPromise.resolve();
        });
      } else {
        loadThumbPromise.resolve();
      }
    };

    if('url' in thumb) {
      haveThumbCached = true;
      div.forEach((div) => {
        const thumbImage = new Image();
        renderImageFromUrl(thumbImage, (thumb as any).url, () => afterRender(div, thumbImage));
      });
    } else if('bytes' in thumb) {
      if(thumb._ === 'photoPathSize') {
        if(!thumb.bytes.length) {
          thumb = doc.thumbs.find((t) => (t as PhotoSize.photoStrippedSize).bytes?.length) || thumb;
        }

        const d = getPathFromBytes((thumb as PhotoSize.photoStrippedSize).bytes);
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.classList.add('rlottie-vector', 'media-sticker', 'thumbnail');
        svg.setAttributeNS(null, 'viewBox', `0 0 ${doc.w || 512} ${doc.h || 512}`);

        // const defs = document.createElementNS(ns, 'defs');
        // const linearGradient = document.createElementNS(ns, 'linearGradient');
        // linearGradient.setAttributeNS(null, 'id', 'g');
        // linearGradient.setAttributeNS(null, 'x1', '-300%');
        // linearGradient.setAttributeNS(null, 'x2', '-200%');
        // linearGradient.setAttributeNS(null, 'y1', '0');
        // linearGradient.setAttributeNS(null, 'y2', '0');
        // const stops = [
        //   ['-10%', '.1'],
        //   ['30%', '.07'],
        //   ['70%', '.07'],
        //   ['110%', '.1']
        // ].map(([offset, stopOpacity]) => {
        //   const stop = document.createElementNS(ns, 'stop');
        //   stop.setAttributeNS(null, 'offset', offset);
        //   stop.setAttributeNS(null, 'stop-opacity', stopOpacity);
        //   return stop;
        // });
        // const animates = [
        //   ['-300%', '1200%'],
        //   ['-200%', '1300%']
        // ].map(([from, to], idx) => {
        //   const animate = document.createElementNS(ns, 'animate');
        //   animate.setAttributeNS(null, 'attributeName', 'x' + (idx + 1));
        //   animate.setAttributeNS(null, 'from', from);
        //   animate.setAttributeNS(null, 'to', to);
        //   animate.setAttributeNS(null, 'dur', '3s');
        //   animate.setAttributeNS(null, 'repeatCount', 'indefinite');
        //   return animate;
        // });
        // linearGradient.append(...stops, ...animates);
        // defs.append(linearGradient);
        // svg.append(defs);

        const path = document.createElementNS(ns, 'path');
        path.setAttributeNS(null, 'd', d);
        if(liteMode.isAvailable('animations') && !isCustomEmoji) path.setAttributeNS(null, 'fill', 'url(#g)');
        svg.append(path);
        div.forEach((div, idx) => div.append(idx > 0 ? svg.cloneNode(true) : svg));
        haveThumbCached = true;
        loadThumbPromise.resolve();
      } else if(toneIndex <= 0) {
        const r = () => {
          (div as HTMLElement[]).forEach((div) => {
            const thumbImage = new Image();
            const url = getPreviewURLFromThumb(doc, thumb as PhotoSize.photoStrippedSize, true);
            renderImageFromUrl(thumbImage, url, () => afterRender(div, thumbImage));
          });
        };

        if((IS_WEBP_SUPPORTED || doc.pFlags.stickerThumbConverted || cacheContext.url)/*  && false */) {
          haveThumbCached = true;
          r();
        } else {
          haveThumbCached = true;
          webpWorkerController.convert('main-' + doc.id, thumb.bytes).then((bytes) => {
            managers.appDocsManager.saveWebPConvertedStrippedThumb(doc.id, bytes);
            (thumb as PhotoSize.photoStrippedSize).bytes = bytes;
            doc.pFlags.stickerThumbConverted = true;

            if((middleware && !middleware()) || (div as HTMLElement[])[0].childElementCount) {
              loadThumbPromise.resolve();
              return;
            }

            r();
          }).catch(() => loadThumbPromise.resolve());
        }
      }
    } else if(((stickerType === 2 && toneIndex <= 0) || stickerType === 3) && (withThumb || onlyThumb)) {
      const load = async() => {
        if((div as HTMLElement[])[0].childElementCount || (middleware && !middleware())) {
          loadThumbPromise.resolve();
          return;
        }

        const r = (div: HTMLElement, thumbImage: HTMLElement, url: string) => {
          if(div.childElementCount || (middleware && !middleware())) {
            loadThumbPromise.resolve();
            return;
          }

          if(!url) afterRender(div, thumbImage);
          else renderImageFromUrl(thumbImage, url, () => afterRender(div, thumbImage));
        };

        await getCacheContext();
        (div as HTMLElement[]).forEach((div) => {
          if(cacheContext.url) {
            r(div, new Image(), cacheContext.url);
          } else if('bytes' in thumb) {
            const res = getImageFromStrippedThumb(doc, thumb as PhotoSize.photoStrippedSize, true);
            res.loadPromise.then(() => r(div, res.image, ''));

            // return managers.appDocsManager.getThumbURL(doc, thumb as PhotoSize.photoStrippedSize).promise.then(r);
          } else {
            appDownloadManager.downloadMediaURL({
              media: doc,
              thumb: thumb as PhotoSize
            }).then(async(url) => {
              return r(div, new Image(), url);
            });
          }
        });
      };

      if(lazyLoadQueue && onlyThumb) {
        lazyLoadQueue.push({div: div[0], load});
        loadThumbPromise.resolve();
        return ret;
      } else {
        load();

        if((thumb as any).url) {
          haveThumbCached = true;
        }
      }
    }
  }

  if(loadPromises && haveThumbCached) {
    loadPromises.push(loadThumbPromise);
  }

  if(onlyThumb/*  || true */) { // for sticker panel
    return ret;
  }

  const middlewareError = makeError('MIDDLEWARE');
  const load = async() => {
    if(middleware && !middleware()) {
      throw middlewareError;
    }

    if(stickerType === 2 && !asStatic) {
      const blob = await appDownloadManager.downloadMedia({media: doc, queueId: lazyLoadQueue?.queueId, thumb: fullThumb});
      if(middleware && !middleware()) {
        throw middlewareError;
      }

      const animation = await lottieLoader.loadAnimationWorker({
        container: (div as HTMLElement[])[0],
        loop,
        autoplay: play,
        animationData: blob,
        width,
        height,
        name: 'doc' + doc.id,
        needUpscale,
        skipRatio,
        toneIndex,
        sync: isCustomEmoji,
        middleware: loadStickerMiddleware ?? middleware,
        group,
        liteModeKey: liteModeKey || undefined,
        textColor: !isCustomEmoji ? textColor : undefined
      });

      // const deferred = deferredPromise<void>();

      const setLockColor = willHaveLock ? () => {
        const lockUrl = locksUrls[doc.id] ??= computeLockColor(animation.canvas[0]);
        (div as HTMLElement[]).forEach((div) => div.style.setProperty('--lock-url', `url(${lockUrl})`));
      } : undefined;

      const onFirstFrame = (container: HTMLElement, canvas: HTMLCanvasElement) => {
        const element = container.firstElementChild !== canvas && container.firstElementChild as HTMLElement;
        if(needFadeIn !== false) {
          needFadeIn = (needFadeIn || !element || element.tagName === 'svg') && liteMode.isAvailable('animations');
        }

        const cb = () => {
          if(element && element !== canvas && element.tagName !== 'DIV') {
            element.remove();
          }
        };

        if(!needFadeIn) {
          if(element) {
            sequentialDom.mutate(cb);
          }
        } else {
          sequentialDom.mutate(() => {
            canvas && canvas.classList.add('fade-in');
            if(element) {
              element.classList.add('fade-out');
            }

            onAnimationEnd(canvas || element, () => {
              sequentialDom.mutate(() => {
                canvas && canvas.classList.remove('fade-in');
                cb();
              });
            }, 400);
          });
        }
      };

      animation.addEventListener('firstFrame', () => {
        const canvas = animation.canvas[0];
        if(withThumb !== false || isCustomEmoji) {
          saveLottiePreview(doc, canvas, lottieCachedThumbToneIndex);
        }

        if(willHaveLock) {
          setLockColor();
        }

        if(!isCustomEmoji) {
          (div as HTMLElement[]).forEach((container, idx) => {
            onFirstFrame(container, animation.canvas[idx]);
          });
        }
      }, {once: true});

      if(emoji) {
        managers.appStickersManager.preloadAnimatedEmojiStickerAnimation(emoji);
      }

      return animation;

      // return deferred;
      // await new Promise((resolve) => setTimeout(resolve, 5e3));
    } else if(asStatic || stickerType === 3) {
      const isSingleVideo = isAnimated && syncedVideo;
      const cacheName = isSingleVideo ? framesCache.generateName('' + doc.id, 0, 0, undefined, undefined) : undefined;

      const cachePromise = videosCache[cacheName];
      if(cachePromise) {
        return cachePromise as typeof promise;
      }

      const d = isSingleVideo ? (div as HTMLElement[]).slice(0, 1) : div as HTMLElement[];
      const media: HTMLElement[] = d.map(() => {
        let media: HTMLElement;
        if(asStatic) {
          media = new Image();
        } else {
          const video = media = createVideo();
          video.muted = true;
          if(play) video.autoplay = true;
          if(loop) video.loop = true;

          if(loop && typeof(loop) === 'number') {
            let previousTime = 0, playedTimes = 0;
            function onTimeupdate(this: HTMLVideoElement) {
              if(previousTime > this.currentTime && ++playedTimes === loop as number) {
                this.autoplay = false;
                this.loop = false;
                this.pause();
                video.removeEventListener('timeupdate', onTimeupdate);
              }

              previousTime = this.currentTime;
            }

            video.addEventListener('timeupdate', onTimeupdate);
          }
        }

        media.classList.add('media-sticker');
        return media;
      });

      const thumbImage = (div as HTMLElement[]).map((div, idx) => (div.firstElementChild as HTMLElement) !== media[idx] && div.firstElementChild) as HTMLElement[];
      if(needFadeIn !== false) {
        needFadeIn = (needFadeIn || !downloaded || (asStatic ? thumbImage[0] : (!thumbImage[0] || thumbImage[0].tagName === 'svg'))) && liteMode.isAvailable('animations');
      }

      if(needFadeIn) {
        media.forEach((media) => media.classList.add('fade-in'));
      }

      const promise = new Promise<HTMLVideoElement[] | HTMLImageElement[]>(async(resolve, reject) => {
        const r = async() => {
          if(middleware && !middleware()) {
            reject(middlewareError);
            return;
          }

          const mediaLength = media.length;
          const loaded: HTMLElement[] = [];
          const onLoad = (div: HTMLElement, media: HTMLElement, thumbImage: HTMLElement) => {
            sequentialDom.mutateElement(div, () => {
              if(middleware && !middleware()) {
                reject(middlewareError);
                return;
              }

              if(!media) {
                if(!isSingleVideo || !isAnimated) {
                  thumbImage?.remove();
                }

                return;
              }

              if(media instanceof HTMLVideoElement) {
                // * video sticker can have arbitrary dimensions
                const {videoWidth, videoHeight} = media;
                const ratio = videoWidth / videoHeight;

                let w = width * window.devicePixelRatio;
                let h = height * window.devicePixelRatio;
                if(ratio < 1) {
                  w = h * ratio;
                } else {
                  h = w / ratio;
                }

                if(!isSavingLottiePreview(doc, toneIndex, w, h)) {
                  // const perf = performance.now();
                  const canvas = document.createElement('canvas');
                  canvas.width = w;
                  canvas.height = h;
                  const ctx = canvas.getContext('2d');
                  ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
                  saveLottiePreview(doc, canvas, toneIndex);
                  // console.log('perf', performance.now() - perf);
                }
              }

              if(isSingleVideo) {
                resolve(media as any);
                return;
              }

              div.append(media);

              if(needFadeIn) {
                thumbImage && thumbImage.classList.add('fade-out');
                onAnimationEnd(media, () => {
                  media.classList.remove('fade-in');
                  thumbImage?.remove();
                }, 400);
              } else {
                thumbImage?.remove();
              }

              if(isAnimated) {
                animationIntersector.addAnimation({
                  animation: media as HTMLVideoElement,
                  observeElement: div,
                  group,
                  controlled: middleware,
                  liteModeKey: liteModeKey || undefined
                });
              }

              if(loaded.push(media) === mediaLength) {
                resolve(loaded as any);
              }
            });
          };

          await getCacheContext();
          let lastPromise: Promise<any>;
          (div as HTMLElement[]).forEach((div, idx) => {
            const _media = media[idx];
            const cb = () => onLoad(div, _media, thumbImage[idx]);
            if(_media) lastPromise = renderImageFromUrlPromise(_media, cacheContext.url);
            lastPromise.then(cb);
          });
        };

        await getCacheContext();
        if(cacheContext.url) r();
        else {
          let promise: Promise<any>;
          if(stickerType !== 1 && asStatic) {
            const thumb = choosePhotoSize(doc, width, height, false) as PhotoSize.photoSize;
            // promise = managers.appDocsManager.getThumbURL(doc, thumb).promise
            promise = appDownloadManager.downloadMediaURL({media: doc, thumb, queueId: lazyLoadQueue?.queueId});
          } else {
            promise = appDownloadManager.downloadMediaURL({media: doc, queueId: lazyLoadQueue?.queueId});
          }

          promise.then(r, reject);
        }
      });

      if(cacheName) {
        videosCache[cacheName] = promise as any;
        loadStickerMiddleware && promise.finally(() => {
          if(!loadStickerMiddleware()) {
            delete videosCache[cacheName];
          }
        });
      }

      return promise;
    }
  };

  if(exportLoad && ((exportLoad === 1 && (!downloaded || isAnimated)) || exportLoad === 2)) {
    ret.load = load;
    return ret;
  }

  const loadPromise: Promise<Awaited<ReturnType<typeof load>> | void> = lazyLoadQueue && (!downloaded || isAnimated) ?
    (lazyLoadQueue.push({div: div[0], load}), Promise.resolve()) :
    load();

  if(downloaded && (asStatic/*  || stickerType === 3 */)) {
    loadThumbPromise = loadPromise as any;
    if(loadPromises) {
      loadPromises.push(loadThumbPromise);
    }
  }

  if(stickerType === 2 && effectThumb && isOut !== undefined && !noPremium) {
    attachStickerEffectHandler({
      container: div[0],
      doc,
      managers,
      middleware,
      isOut,
      width,
      loadPromise,
      relativeEffect,
      loopEffect
    });
  }

  ret.render = loadPromise as any;
  return ret;
}

function attachStickerEffectHandler({container, doc, managers, middleware, isOut, width, loadPromise, relativeEffect, loopEffect}: {
  container: HTMLElement,
  doc: MyDocument,
  managers: AppManagers,
  middleware: Middleware,
  isOut: boolean,
  width: number,
  loadPromise: Promise<any>,
  relativeEffect?: boolean,
  loopEffect?: boolean
}) {
  managers.appStickersManager.preloadSticker(doc.id, true);

  let playing = false;
  attachClickEvent(container, async(e) => {
    const isAvailable = liteMode.isAvailable('effects_premiumstickers') || relativeEffect;
    cancelEvent(e);
    if(!e.isTrusted && !isAvailable) {
      return;
    }

    if(playing || !isAvailable) {
      const a = document.createElement('a');
      a.onclick = () => {
        hideToast();
        PopupElement.createPopup(PopupStickers, doc.stickerSetInput).show();
      };

      toastNew({
        langPackKey: 'Sticker.Premium.Click.Info',
        langPackArguments: [a]
      });

      return;
    }

    playing = true;

    await loadPromise;
    const {animationDiv, stickerPromise} = wrapStickerAnimation({
      doc,
      middleware,
      side: isOut ? 'right' : 'left',
      size: width * STICKER_EFFECT_MULTIPLIER,
      target: container,
      play: true,
      fullThumb: getStickerEffectThumb(doc),
      relativeEffect,
      loopEffect
    });

    if(isOut !== undefined && !isOut/*  && !relativeEffect */) {
      animationDiv.classList.add('reflect-x');
    }

    stickerPromise.then((player) => {
      player.addEventListener('destroy', () => {
        playing = false;
      });
    });
  });
}

export async function onEmojiStickerClick({event, container, managers, peerId, middleware}: {
  event: Event,
  container: HTMLElement,
  managers: AppManagers,
  peerId: PeerId,
  middleware: Middleware
}) {
  cancelEvent(event);

  const bubble = findUpClassName(container, 'bubble');
  const emoji = container.dataset.stickerEmoji;

  const animation = !container.classList.contains('custom-emoji') ? lottieLoader.getAnimation(container) : undefined;
  if(animation?.paused) {
    const doc = await managers.appStickersManager.getAnimatedEmojiSoundDocument(emoji);
    if(doc) {
      const audio = document.createElement('audio');
      audio.style.display = 'none';
      container.parentElement.append(audio);

      try {
        const url = await appDownloadManager.downloadMediaURL({media: doc});

        audio.src = url;
        audio.play();
        await onMediaLoad(audio, undefined, true);

        audio.addEventListener('ended', () => {
          audio.src = '';
          audio.remove();
        }, {once: true});
      } catch(err) {

      }
    }

    animation.autoplay = true;
    animation.restart();
  }

  if(!peerId.isUser() || !liteMode.isAvailable('effects_emoji')) {
    return;
  }

  const activeAnimations: Set<{}> = (container as any).activeAnimations ??= new Set();
  if(activeAnimations.size >= 3) {
    return;
  }

  const doc = await managers.appStickersManager.getAnimatedEmojiSticker(emoji, true);
  if(!doc) {
    return;
  }

  const data: SendMessageEmojiInteractionData = (container as any).emojiData ??= {
    a: [],
    v: 1
  };

  const sendInteractionThrottled: () => void = (container as any).sendInteractionThrottled ??= throttle(() => {
    const length = data.a.length;
    if(!length) {
      return;
    }

    const firstTime = data.a[0].t;

    data.a.forEach((a) => {
      a.t = (a.t - firstTime) / 1000;
    });

    const bubble = findUpClassName(container, 'bubble');
    managers.appMessagesManager.setTyping(appImManager.chat.peerId, {
      _: 'sendMessageEmojiInteraction',
      msg_id: getServerMessageId(+bubble.dataset.mid),
      emoticon: emoji,
      interaction: {
        _: 'dataJSON',
        data: JSON.stringify(data)
      }
    }, true, appImManager.chat.threadId);

    data.a.length = 0;
  }, 1000, false);

  const o = {};
  activeAnimations.add(o);

  const isOut = bubble ? bubble.classList.contains('is-out') : undefined;
  const {animationDiv} = wrapStickerAnimation({
    doc,
    middleware,
    side: isOut ? 'right' : 'left',
    size: 360,
    target: container,
    play: true,
    withRandomOffset: true,
    onUnmount: () => {
      activeAnimations.delete(o);
    }
  });

  if(isOut !== undefined && !isOut) {
    animationDiv.classList.add('reflect-x');
  }

  // using a trick here: simulated event from interlocutor's interaction won't fire ours
  if(event.isTrusted) {
    data.a.push({
      i: 1,
      t: Date.now()
    });

    sendInteractionThrottled();
  }
  // });
}
