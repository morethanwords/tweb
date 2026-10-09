import type {MyDocument} from '@appManagers/appDocsManager';
import type {MyPhoto} from '@appManagers/appPhotosManager';
import type {MediaPeekKind} from '@components/mediaPeek';
import {simulateClickEvent} from '@helpers/dom/clickEvent';
import isVideoStalled from '@helpers/dom/isVideoStalled';
import playOrPlayMuted from '@helpers/dom/playOrPlayMuted';
import safePlay from '@helpers/dom/safePlay';
import setCurrentTime from '@helpers/dom/setCurrentTime';
import {MediaSize} from '@helpers/mediaSize';
import {Middleware} from '@helpers/middleware';
import noop from '@helpers/noop';
import {doubleRaf} from '@helpers/schedulers';
import pause from '@helpers/schedulers/pause';
import {DocumentAttribute} from '@layer';
import choosePhotoSize from '@appManagers/utils/photos/choosePhotoSize';
import getStickerEffectThumb from '@appManagers/utils/stickers/getStickerEffectThumb';
import apiManagerProxy from '@lib/apiManagerProxy';
import {pinObjectURL} from '@helpers/objectUrl';
import getQualityLevels, {playsOverHls} from '@lib/hls/getQualityLevels';
import CustomEmojiElement from '@lib/customEmoji/element';
import lottieLoader from '@lib/lottie/lottieLoader';
import LottiePlayer from '@lib/lottie/lottiePlayer';
import rootScope from '@lib/rootScope';
import {AnimationItemGroup} from '@components/animationIntersector';
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import type ProgressivePreloader from '@components/preloader';
import {EMOJI_TEXT_COLOR} from '@components/emoticonsDropdown';
import wrapPhoto from '@components/wrappers/photo';
import wrapSticker from '@components/wrappers/sticker';
import wrapVideo from '@components/wrappers/video';

export type MediaPeekPlayback = {
  // * starts the media moving once the peek has finished opening
  play: (withSound?: boolean) => void,
  // * there is sound to play: this silences it
  mute?: () => void
};

const NO_PLAYBACK: MediaPeekPlayback = {play: noop};

/**
 * Draws the media of a peek into `container` and resolves once there is something to show: the first
 * frame of a sticker, a GIF that can play, what the element showed or else the cached size of a photo,
 * the poster of a video.
 */
export default async function renderMediaPeek({
  kind,
  media,
  emoji,
  container,
  element,
  snapshot,
  size,
  isOut,
  group,
  middleware,
  getTextColor
}: {
  kind: MediaPeekKind,
  media: MyDocument | MyPhoto,
  emoji: string,
  container: HTMLElement,
  // * what the peek was opened on: its animation or video hands over its position
  element: HTMLElement,
  // * what it showed: under the media until the media draws, in place of a blurred thumbnail
  snapshot?: HTMLElement,
  size: MediaSize,
  isOut: boolean,
  group: AnimationItemGroup,
  middleware: Middleware,
  getTextColor?: () => string
}): Promise<MediaPeekPlayback> {
  const {width, height} = size;
  // * a copy of a rendered image draws from the picture the browser has decoded, once it has caught up
  const snapshotDecoded = snapshot instanceof HTMLImageElement && snapshot.decode().catch(noop);
  if(snapshot) {
    container.append(snapshot);
  }

  switch(kind) {
    case 'sticker': {
      const doc = media as MyDocument;
      const attribute = doc.attributes.find((attribute) => attribute._ === 'documentAttributeCustomEmoji') as DocumentAttribute.documentAttributeCustomEmoji;
      const {render} = await wrapSticker({
        doc,
        div: container,
        group,
        width,
        height,
        play: false,
        loop: true,
        middleware,
        managers: rootScope.managers,
        needFadeIn: false,
        isOut,
        emoji: attribute ? undefined : emoji,
        withThumb: false,
        relativeEffect: true,
        loopEffect: true,
        textColor: attribute?.pFlags.text_color ? getTextColor?.() || EMOJI_TEXT_COLOR : undefined
      });
      const rendered = await render;
      const player = Array.isArray(rendered) ? rendered[0] : rendered;
      await Promise.all([
        player instanceof LottiePlayer && new Promise<void>((resolve) => player.addEventListener('firstFrame', resolve, {once: true})),
        doubleRaf()
      ]);
      await pause(0); // ! firstFrame fires from inside the render loop
      if(!middleware()) return NO_PLAYBACK;

      if(player instanceof LottiePlayer) {
        await syncLottieFrame(player, element, middleware);
      } else if(player instanceof HTMLVideoElement) {
        syncVideoTime(player, element);
      }

      return {
        play: () => {
          if(player instanceof LottiePlayer || player instanceof HTMLVideoElement) {
            safePlay(player);
          }

          // * a premium sticker plays its effect on click
          if(getStickerEffectThumb(doc)) {
            simulateClickEvent(container);
          }
        }
      };
    }

    case 'gif':
    case 'video': {
      const doc = media as MyDocument;
      // * streamed the way the media viewer streams it: over HLS when it comes in several qualities
      const altDocs = kind === 'video' && doc.supportsStreaming && apiManagerProxy.isServiceWorkerOnline() ?
        await rootScope.managers.appDocsManager.getAltDocsByDocument(doc.id) :
        undefined;
      if(!middleware()) return NO_PLAYBACK;
      // * a video nothing can stream is downloaded whole. Putting the peek away leaves the download
      // * going, as closing the media viewer does: it is one per file, shared with the chat's own and a
      // * save to disk, so calling it off would call theirs off too
      const result = await wrapVideo({
        doc,
        container,
        group,
        boxWidth: width,
        boxHeight: height,
        canAutoplay: true,
        middleware,
        noInfo: true,
        // * a GIF is waited for before the peek opens; a video shows how far it has got
        withoutPreloader: kind === 'gif',
        // * the frame the element showed is the poster
        noPreview: !!snapshot,
        ...(kind === 'video' && {
          withPreview: !snapshot,
          photoSize: choosePhotoSize(doc, width, height),
          hlsStreaming: !!altDocs && playsOverHls(getQualityLevels(altDocs)),
          streamablePreloader: true
        })
      });

      // * a GIF or a downloaded video loops from a shared blob URL: kept alive while the peek plays it
      result.loadPromise?.then(() => {
        middleware.onClean(pinObjectURL(apiManagerProxy.getCacheContext(doc).url));
      }, noop);

      // * a GIF is small enough to wait for, a video plays over its poster once it can
      if(kind === 'gif') {
        await result.loadPromise;
      } else if(result.thumb) {
        await waitForPlaceholder(result.thumb).catch(noop);
      }

      await snapshotDecoded;
      await doubleRaf();
      const {video} = result;
      if(!video) {
        return NO_PLAYBACK;
      }

      syncVideoTime(video, element);

      // * a stream that stalls on its way shows its loader again, as in the media viewer
      const preloader: ProgressivePreloader = (container as any).preloader;
      if(preloader && doc.supportsStreaming) {
        video.addEventListener('waiting', () => {
          if(isVideoStalled(video)) {
            preloader.attach(container, false, null);
          }
        });
        video.addEventListener('canplay', () => preloader.detach());
      }

      const attribute = doc.attributes.find((attribute) => attribute._ === 'documentAttributeVideo') as DocumentAttribute.documentAttributeVideo;
      if(kind === 'gif' || attribute?.pFlags.nosound) {
        return {play: () => safePlay(video)};
      }

      return {
        play: (withSound) => {
          if(withSound) {
            appMediaPlaybackController.applySharedVolume(video);
          }

          playOrPlayMuted(video);
        },
        mute: () => {
          video.muted = true;
        }
      };
    }

    case 'photo': {
      const result = await wrapPhoto({
        photo: media,
        container,
        boxWidth: width,
        boxHeight: height,
        size: choosePhotoSize(media, width, height),
        middleware,
        withoutPreloader: true,
        noThumb: !!snapshot
      });

      // * what the element showed, or else whatever size is downloaded already, stands in until the
      // * bigger one arrives
      await (snapshot ? snapshotDecoded : waitForPlaceholder(result));
      // * a cached photo is ready before the page has drawn the peek where it starts from
      await doubleRaf();
      return NO_PLAYBACK;
    }
  }
}

// * the thumbnail a photo, or a video's poster, shows first: the stripped one, or else the cached size
function waitForPlaceholder(result: Awaited<ReturnType<typeof wrapPhoto>>) {
  return result.images.thumb ? result.loadPromises.thumb : result.loadPromises.full;
}

// * carry on from where the small copy is, instead of starting over
function syncVideoTime(video: HTMLVideoElement, element: HTMLElement) {
  const playing = element.querySelector<HTMLVideoElement>('video');
  if(playing?.currentTime) {
    setCurrentTime(video, playing.currentTime);
  }
}

async function syncLottieFrame(player: LottiePlayer, element: HTMLElement, middleware: Middleware) {
  const playing = element instanceof CustomEmojiElement ?
    element.player as LottiePlayer :
    lottieLoader.getAnimation(element);
  if(!playing) {
    return;
  }

  player.curFrame = playing.curFrame;
  player.play();
  await new Promise<void>((resolve) => {
    let frames = 0;
    const onEnterFrame = () => {
      if(++frames === 2) {
        player.removeEventListener('enterFrame', onEnterFrame);
        resolve();
      }
    };

    player.addEventListener('enterFrame', onEnterFrame);
  });

  if(middleware()) {
    player.pause();
  }
}
