/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_WEBP_SUPPORTED from "../../environment/webpSupport";
import assumeType from "../../helpers/assumeType";
import getPathFromBytes from "../../helpers/bytes/getPathFromBytes";
import deferredPromise from "../../helpers/cancellablePromise";
import cancelEvent from "../../helpers/dom/cancelEvent";
import { attachClickEvent } from "../../helpers/dom/clickEvent";
import createVideo from "../../helpers/dom/createVideo";
import findUpClassName from "../../helpers/dom/findUpClassName";
import renderImageFromUrl from "../../helpers/dom/renderImageFromUrl";
import getImageFromStrippedThumb from "../../helpers/getImageFromStrippedThumb";
import getPreviewURLFromThumb from "../../helpers/getPreviewURLFromThumb";
import onMediaLoad from "../../helpers/onMediaLoad";
import { isSavingLottiePreview, saveLottiePreview } from "../../helpers/saveLottiePreview";
import throttle from "../../helpers/schedulers/throttle";
import sequentialDom from "../../helpers/sequentialDom";
import { PhotoSize } from "../../layer";
import { MyDocument } from "../../lib/appManagers/appDocsManager";
import appDownloadManager from "../../lib/appManagers/appDownloadManager";
import appImManager from "../../lib/appManagers/appImManager";
import { AppManagers } from "../../lib/appManagers/managers";
import getServerMessageId from "../../lib/appManagers/utils/messageId/getServerMessageId";
import choosePhotoSize from "../../lib/appManagers/utils/photos/choosePhotoSize";
import lottieLoader from "../../lib/rlottie/lottieLoader";
import RLottiePlayer from "../../lib/rlottie/rlottiePlayer";
import rootScope from "../../lib/rootScope";
import type { ThumbCache } from "../../lib/storages/thumbs";
import webpWorkerController from "../../lib/webp/webpWorkerController";
import { SendMessageEmojiInteractionData } from "../../types";
import { getEmojiToneIndex } from "../../vendor/emoji";
import animationIntersector from "../animationIntersector";
import LazyLoadQueue from "../lazyLoadQueue";
import wrapStickerAnimation from "./stickerAnimation";

export default async function wrapSticker({doc, div, middleware, lazyLoadQueue, group, play, onlyThumb, emoji, width, height, withThumb, loop, loadPromises, needFadeIn, needUpscale, skipRatio, static: asStatic, managers = rootScope.managers}: {
  doc: MyDocument, 
  div: HTMLElement, 
  middleware?: () => boolean, 
  lazyLoadQueue?: LazyLoadQueue, 
  group?: string, 
  play?: boolean, 
  onlyThumb?: boolean,
  emoji?: string,
  width?: number,
  height?: number,
  withThumb?: boolean,
  loop?: boolean,
  loadPromises?: Promise<any>[],
  needFadeIn?: boolean,
  needUpscale?: boolean,
  skipRatio?: number,
  static?: boolean,
  managers?: AppManagers
}) {
  const stickerType = doc.sticker;
  if(stickerType === 1) {
    asStatic = true;
  }

  if(!width) {
    width = !emoji ? 200 : undefined;
  }

  if(!height) {
    height = !emoji ? 200 : undefined;
  }

  if(stickerType === 2) {
    //LottieLoader.loadLottie();
    lottieLoader.loadLottieWorkers();
  }
  
  if(!stickerType) {
    console.error('wrong doc for wrapSticker!', doc);
    throw new Error('wrong doc for wrapSticker!');
  }

  div.dataset.docId = '' + doc.id;
  div.classList.add('media-sticker-wrapper');

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
  
  //console.log('wrap sticker', doc, div, onlyThumb);

  let cacheContext: ThumbCache;
  let getCacheContext = async(type: string = cacheContext?.type) => {
    return cacheContext = await managers.thumbsStorage.getCacheContext(doc, type);
  };

  if(asStatic && stickerType !== 1) {
    const thumb = choosePhotoSize(doc, width, height, false) as PhotoSize.photoSize;
    await getCacheContext(thumb.type);
  } else {
    await getCacheContext();
  }

  const toneIndex = emoji ? getEmojiToneIndex(emoji) : -1;
  const downloaded = cacheContext.downloaded && !needFadeIn;

  const isAnimated = !asStatic && (stickerType === 2 || stickerType === 3);
  const isThumbNeededForType = isAnimated;
  const lottieCachedThumb = stickerType === 2 || stickerType === 3 ? await managers.appDocsManager.getLottieCachedThumb(doc.id, toneIndex) : undefined;
  
  let loadThumbPromise = deferredPromise<void>();
  let haveThumbCached = false;
  if((
      doc.thumbs?.length || 
      lottieCachedThumb
    ) && 
    !div.firstElementChild && (
      !downloaded || 
      isThumbNeededForType ||  
      onlyThumb
    ) && withThumb !== false/*  && doc.thumbs[0]._ !== 'photoSizeEmpty' */
  ) {
    let thumb = lottieCachedThumb || doc.thumbs[0];
    
    //console.log('wrap sticker', thumb, div);

    let thumbImage: HTMLImageElement | HTMLCanvasElement;
    const afterRender = () => {
      if(!div.childElementCount) {
        thumbImage.classList.add('media-sticker', 'thumbnail');
        
        sequentialDom.mutateElement(div, () => {
          div.append(thumbImage);
          loadThumbPromise.resolve();
        });
      }
    };

    if('url' in thumb) {
      thumbImage = new Image();
      renderImageFromUrl(thumbImage, thumb.url, afterRender);
      haveThumbCached = true;
    } else if('bytes' in thumb) {
      if(thumb._ === 'photoPathSize') {
        if(thumb.bytes.length) {
          const d = getPathFromBytes(thumb.bytes);
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
          if(rootScope.settings.animationsEnabled) path.setAttributeNS(null, 'fill', 'url(#g)');
          svg.append(path);
          div.append(svg);
        } else {
          thumb = doc.thumbs.find((t) => (t as PhotoSize.photoStrippedSize).bytes?.length) || thumb;
        }
      } else if(toneIndex <= 0) {
        thumbImage = new Image();

        if((IS_WEBP_SUPPORTED || doc.pFlags.stickerThumbConverted || cacheContext.url)/*  && false */) {
          renderImageFromUrl(thumbImage, getPreviewURLFromThumb(doc, thumb, true), afterRender);
          haveThumbCached = true;
        } else {
          webpWorkerController.convert('main-' + doc.id, thumb.bytes).then((bytes) => {
            managers.appDocsManager.saveWebPConvertedStrippedThumb(doc.id, bytes);
            (thumb as PhotoSize.photoStrippedSize).bytes = bytes;
            doc.pFlags.stickerThumbConverted = true;
            
            if(middleware && !middleware()) return;
  
            if(!div.childElementCount) {
              renderImageFromUrl(thumbImage, getPreviewURLFromThumb(doc, thumb as PhotoSize.photoStrippedSize, true), afterRender);
            }
          }).catch(() => {});
        }
      }
    } else if(((stickerType === 2 && toneIndex <= 0) || stickerType === 3) && (withThumb || onlyThumb)) {
      const load = async() => {
        if(div.childElementCount || (middleware && !middleware())) return;

        const r = () => {
          if(div.childElementCount || (middleware && !middleware())) return;
          renderImageFromUrl(thumbImage, cacheContext.url, afterRender);
        };
  
        await getCacheContext();
        if(cacheContext.url) {
          r();
          return;
        } else {
          const res = getImageFromStrippedThumb(doc, thumb as PhotoSize.photoStrippedSize, true);
          thumbImage = res.image;
          res.loadPromise.then(r);
          
          // return managers.appDocsManager.getThumbURL(doc, thumb as PhotoSize.photoStrippedSize).promise.then(r);
        }
      };
      
      if(lazyLoadQueue && onlyThumb) {
        lazyLoadQueue.push({div, load});
        return;
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
    return;
  }
  
  const load = async() => {
    if(middleware && !middleware()) return;

    if(stickerType === 2 && !asStatic) {
      /* if(doc.id === '1860749763008266301') {
        console.log('loaded sticker:', doc, div);
      } */

      //await new Promise((resolve) => setTimeout(resolve, 500));
      //return;

      //console.time('download sticker' + doc.id);

      //appDocsManager.downloadDocNew(doc.id).promise.then((res) => res.json()).then(async(json) => {
      //fetch(doc.url).then((res) => res.json()).then(async(json) => {
      return await appDownloadManager.downloadMedia({media: doc, queueId: lazyLoadQueue?.queueId})
      .then(async(blob) => {
        //console.timeEnd('download sticker' + doc.id);
        //console.log('loaded sticker:', doc, div/* , blob */);
        if(middleware && !middleware()) {
          throw new Error('wrapSticker 2 middleware');
        }

        let animation = await lottieLoader.loadAnimationWorker({
          container: div,
          loop: loop && !emoji,
          autoplay: play,
          animationData: blob,
          width,
          height,
          name: 'doc' + doc.id,
          needUpscale,
          skipRatio,
          toneIndex
        }, group, middleware);

        //const deferred = deferredPromise<void>();
  
        animation.addEventListener('firstFrame', () => {
          const element = div.firstElementChild;
          if(needFadeIn !== false) {
            needFadeIn = (needFadeIn || !element || element.tagName === 'svg') && rootScope.settings.animationsEnabled;
          }

          const cb = () => {
            if(element && element !== animation.canvas) {
              element.remove();
            }
          };

          if(!needFadeIn) {
            if(element) {
              sequentialDom.mutate(cb);
            }
          } else {
            sequentialDom.mutate(() => {
              animation.canvas.classList.add('fade-in');
              if(element) {
                element.classList.add('fade-out');
              }
  
              animation.canvas.addEventListener('animationend', () => {
                sequentialDom.mutate(() => {
                  animation.canvas.classList.remove('fade-in');
                  cb();
                });
              }, {once: true});
            });
          }

          if(withThumb !== false) {
            saveLottiePreview(doc, animation.canvas, toneIndex);
          }

          //deferred.resolve();
        }, {once: true});
  
        if(emoji) {
          const data: SendMessageEmojiInteractionData = {
            a: [],
            v: 1
          };

          let sendInteractionThrottled: () => void;

          managers.appStickersManager.preloadAnimatedEmojiStickerAnimation(emoji);

          attachClickEvent(div, async(e) => {
            cancelEvent(e);
            const animation = lottieLoader.getAnimation(div);
  
            if(animation.paused) {
              const doc = await managers.appStickersManager.getAnimatedEmojiSoundDocument(emoji);
              if(doc) {
                const audio = document.createElement('audio');
                audio.style.display = 'none';
                div.parentElement.append(audio);

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

            const peerId = appImManager.chat.peerId;
            if(!peerId.isUser()) {
              return;
            }

            const doc = await managers.appStickersManager.getAnimatedEmojiSticker(emoji, true);
            if(!doc) {
              return;
            }
            
            const bubble = findUpClassName(div, 'bubble');
            const isOut = bubble.classList.contains('is-out');

            const {animationDiv} = wrapStickerAnimation({
              doc,
              middleware,
              side: isOut ? 'right' : 'left',
              size: 280,
              target: div,
              play: true
            });

            if(bubble) {
              if(isOut) {
                animationDiv.classList.add('is-out');
              } else {
                animationDiv.classList.add('is-in');
              }
            }

            if(!sendInteractionThrottled) {
              sendInteractionThrottled = throttle(() => {
                const length = data.a.length;
                if(!length) {
                  return;
                }
      
                const firstTime = data.a[0].t;
      
                data.a.forEach((a) => {
                  a.t = (a.t - firstTime) / 1000;
                });
      
                const bubble = findUpClassName(div, 'bubble');
                managers.appMessagesManager.setTyping(appImManager.chat.peerId, {
                  _: 'sendMessageEmojiInteraction',
                  msg_id: getServerMessageId(+bubble.dataset.mid),
                  emoticon: emoji,
                  interaction: {
                    _: 'dataJSON',
                    data: JSON.stringify(data)
                  }
                }, true);
      
                data.a.length = 0;
              }, 1000, false);
            }

            // using a trick here: simulated event from interlocutor's interaction won't fire ours
            if(e.isTrusted) {
              data.a.push({
                i: 1,
                t: Date.now()
              });
    
              sendInteractionThrottled();
            }
          });
        }

        return animation;

        //return deferred;
        //await new Promise((resolve) => setTimeout(resolve, 5e3));
      });

      //console.timeEnd('render sticker' + doc.id);
    } else if(asStatic || stickerType === 3) {
      let media: HTMLElement;
      if(asStatic) {
        media = new Image();
      } else {
        media = createVideo();
        (media as HTMLVideoElement).muted = true;

        if(play) {
          (media as HTMLVideoElement).autoplay = true;
          (media as HTMLVideoElement).loop = true;
        }
      }

      const thumbImage = div.firstElementChild !== media && div.firstElementChild;
      if(needFadeIn !== false) {
        needFadeIn = (needFadeIn || !downloaded || (asStatic ? thumbImage : (!thumbImage || thumbImage.tagName === 'svg'))) && rootScope.settings.animationsEnabled;
      }

      media.classList.add('media-sticker');

      if(needFadeIn) {
        media.classList.add('fade-in');
      }

      return new Promise<void>(async(resolve, reject) => {
        const r = async() => {
          if(middleware && !middleware()) return resolve();
  
          const onLoad = () => {
            sequentialDom.mutateElement(div, () => {
              div.append(media);
              if(thumbImage) {
                thumbImage.classList.add('fade-out');
              }

              if(stickerType === 3 && !isSavingLottiePreview(doc, toneIndex)) {
                // const perf = performance.now();
                assumeType<HTMLVideoElement>(media);
                const canvas = document.createElement('canvas');
                canvas.width = width * window.devicePixelRatio;
                canvas.height = height * window.devicePixelRatio;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
                saveLottiePreview(doc, canvas, toneIndex);
                // console.log('perf', performance.now() - perf);
              }

              if(stickerType === 3 && group) {
                animationIntersector.addAnimation(media as HTMLVideoElement, group);
              }

              resolve();

              if(needFadeIn) {
                media.addEventListener('animationend', () => {
                  media.classList.remove('fade-in');
                  if(thumbImage) {
                    thumbImage.remove();
                  }
                }, {once: true});
              }
            });
          };

          await getCacheContext();
          if(asStatic) {
            renderImageFromUrl(media, cacheContext.url, onLoad);
          } else {
            (media as HTMLVideoElement).src = cacheContext.url;
            onMediaLoad(media as HTMLVideoElement).then(onLoad);
          }
        };

        await getCacheContext();
        if(cacheContext.url) r();
        else {
          let promise: Promise<any>;
          if(stickerType === 2 && asStatic) {
            const thumb = choosePhotoSize(doc, width, height, false) as PhotoSize.photoSize;
            // promise = managers.appDocsManager.getThumbURL(doc, thumb).promise
            promise = appDownloadManager.downloadMediaURL({media: doc, thumb, queueId: lazyLoadQueue?.queueId});
          } else {
            promise = appDownloadManager.downloadMediaURL({media: doc, queueId: lazyLoadQueue?.queueId});
          }
            
          promise.then(r, resolve);
        }
      });
    }
  };

  const loadPromise: Promise<RLottiePlayer | void> = lazyLoadQueue && (!downloaded || isAnimated) ? 
    (lazyLoadQueue.push({div, load}), Promise.resolve()) : 
    load();

  if(downloaded && (asStatic/*  || stickerType === 3 */)) {
    loadThumbPromise = loadPromise as any;
    if(loadPromises) {
      loadPromises.push(loadThumbPromise);
    }
  }

  return {render: loadPromise};
}
