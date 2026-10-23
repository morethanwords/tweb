import {createSignal, createEffect, on, JSX, onCleanup, catchError} from 'solid-js';
import {unwrap} from 'solid-js/store';
import rootScope from '@lib/rootScope';
import {Photo, StoryItem, Document, MessageMedia, Message} from '@layer';
import choosePhotoSize from '@appManagers/utils/photos/choosePhotoSize';
import wrapPhoto from '@components/wrappers/photo';
import wrapVideo from '@components/wrappers/video';
import LazyLoadQueue from '@components/lazyLoadQueue';
import {AnimationItemGroup} from '@components/animationIntersector';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import {IS_SAFARI} from '@environment/userAgent';
import createMiddleware from '@helpers/solid/createMiddleware';
import {ChatAutoDownloadSettings} from '@hooks/useAutoDownloadSettings';
import {hotEffect, hotListen} from '@helpers/hotModule';
import liteMode from '@helpers/liteMode';
import noop from '@helpers/noop';
import {Middleware} from '@helpers/middleware';
import appDownloadManager from '@lib/appDownloadManager';
import apiManagerProxy from '@lib/apiManagerProxy';
import {IS_H265_SUPPORTED} from '@environment/videoSupport';
import {i18n} from '@lib/langPack';
import styles from '@components/stories/preview.module.scss';
import {getStoryVideoDocuments, isStoryHighQuality} from '@components/stories/quality';

let processing = false;
const pollStories = () => {
  if(processing) return;
  const promises: PromiseLike<any>[] = [];
  wrappedStories.forEach((map, peerId) => {
    const ids = [...map.keys()];
    const promise = rootScope.managers.appStoriesManager.getStoriesById(peerId, ids, true).then(() => {
      ids.forEach((id) => {
        if(!map.get(id).mounted) {
          map.delete(id);
          if(!map.size) {
            wrappedStories.delete(peerId);
          }
        }
      });
    });

    promises.push(promise);
  });

  Promise.all(promises).then(() => {
    processing = false;
  });
};

const wrappedStories: Map<PeerId, Map<number, {mounted: number}>> = new Map();
(window as any).wrappedStories = wrappedStories;
hotEffect(import.meta.hot, () => {
  const interval = setInterval(pollStories, 300e3);
  return () => clearInterval(interval);
});
// * the beginnings of videos fetched ahead, by stream URL: the service worker keeps the chunks
const prefetchedStreams: Set<string> = new Set();

// * the stories shown were the previous account's - their unmounts still hold the counters, and the
// * service worker keeps another account's chunks apart
hotListen(import.meta.hot, rootScope, 'account_switched', () => {
  wrappedStories.clear();
  prefetchedStreams.clear();
});

// * the viewer puts a story's media in place of the one on screen as soon as it is ready, and a
// * picture that only has its source by then (a cached one goes in without loading) or that is
// * decoded off the frame paints nothing for a frame or more: the story flashed black in between
const readyToPaint = (element: Element) => {
  if(!(element instanceof HTMLImageElement)) return;
  element.decoding = 'sync';
  return element.decode().catch(noop);
};

const getViewerPhotoSize = (photo: Photo.photo | Document.document) => choosePhotoSize(photo, Infinity, Infinity);

// * what the viewer will show of a story, fetched before it is opened: a photo whole, a video's first
// * chunk in each file its element tries (in the quality it plays in, and without HEVC the original
// * first, then the alternative), which the service worker keeps with the file's last one, where an mp4
// * usually has its index. Only the first: a request further on has it read the next 20 MB ahead. A
// * video with no streaming would have to be downloaded whole, too much ahead of time
const preloadStoryMedia = async(peerId: PeerId, storyItem: StoryItem) => {
  const media = unwrap((storyItem as StoryItem.storyItem).media);
  if(media?._ === 'messageMediaPhoto') {
    const photo = media.photo as Photo.photo;
    if(photo?._ === 'photo') {
      await appDownloadManager.downloadMediaURL({media: photo, thumb: getViewerPhotoSize(photo)});
    }

    return;
  }

  if(media?._ !== 'messageMediaDocument') {
    return;
  }

  const {doc, altDoc} = getStoryVideoDocuments(media, isStoryHighQuality(peerId, storyItem as StoryItem.storyItem));
  if(!doc?.supportsStreaming) {
    return;
  }

  for(const _doc of altDoc && !IS_H265_SUPPORTED ? [doc, altDoc] : [doc]) {
    const url = apiManagerProxy.getCacheContext(_doc).url;
    if(!url || prefetchedStreams.has(url)) {
      continue;
    }

    prefetchedStreams.add(url);
    try {
      // * the service worker keeps the chunk as it answers: what is in it is not needed here
      const response = await fetch(url, {headers: {Range: 'bytes=0-'}});
      response.body?.cancel().catch(noop);
      if(!response.ok) prefetchedStreams.delete(url);
    } catch{
      prefetchedStreams.delete(url);
    }
  }
};

// * the stories coming next, fetched one after another behind the one being watched
export const preloadStoriesMedia = async(stories: {peerId: PeerId, storyItem: StoryItem}[], middleware: Middleware) => {
  for(const {peerId, storyItem} of stories) {
    if(!middleware()) {
      return;
    }

    await preloadStoryMedia(peerId, storyItem).catch(noop);
  }
};

type CommonProperties = {
  peerId: PeerId,
  message?: Message.message,
  boxWidth?: number,
  boxHeight?: number,
  withPreloader?: boolean,
  noInfo?: boolean,
  group?: AnimationItemGroup,
  lazyLoadQueue?: LazyLoadQueue,
  autoDownload?: ChatAutoDownloadSettings,
  canAutoplay?: boolean,
  noAspecter?: boolean
};

export const wrapStoryMedia = (props: {
  storyItem: StoryItem.storyItem,
  forPreview?: boolean,
  forViewer?: boolean,
  containerProps?: JSX.HTMLAttributes<HTMLDivElement>,
  childrenClassName?: string,
  noPlayButton?: boolean,
  onlyPreview?: boolean,
  useBlur?: boolean | number,
  // * the original video rather than the lower quality beside it (isStoryHighQuality)
  highQuality?: boolean
} & CommonProperties) => {
  const [thumb, setThumb] = createSignal<HTMLImageElement | HTMLCanvasElement>();
  const [media, setMedia] = createSignal<HTMLImageElement | HTMLVideoElement | HTMLDivElement>();
  const [ready, setReady] = createSignal(false);

  let map = wrappedStories.get(props.peerId);
  if(!map) {
    wrappedStories.set(props.peerId, map = new Map());
  }

  let c = map.get(props.storyItem.id);
  if(!c) {
    map.set(props.storyItem.id, c = {mounted: 0});
  }
  ++c.mounted;
  onCleanup(() => {
    --c.mounted;
  });

  const messageMedia = unwrap(props.storyItem.media);
  const middleware = createMiddleware().get();

  let div: HTMLDivElement;
  const container = <div ref={div} {...(props.containerProps || {})}></div>;

  const setChildrenClassName = (wrapped: {images: {thumb: HTMLElement, full: HTMLElement}}, className: string) => {
    [
      wrapped.images.thumb,
      wrapped.images.full
    ].filter(Boolean).forEach((image) => {
      image.classList.add(className);
    });
  };

  const wrappers = {
    photo: (messageMedia: MessageMedia.messageMediaPhoto | MessageMedia.messageMediaDocument) => {
      const photo = (messageMedia as MessageMedia.messageMediaDocument).document as Document.document || (messageMedia as MessageMedia.messageMediaPhoto).photo as Photo.photo;
      const result = wrapPhoto({
        ...props,
        container: div,
        photo,
        middleware,
        ...(props.forPreview && {
          ...(props.noAspecter && {
            size: choosePhotoSize(photo, 150, 200)
          }),
          // size: choosePhotoSize(photo, 150, 200),
          useRenderCache: false
        }),
        ...(props.forViewer && {
          size: getViewerPhotoSize(photo),
          // * goes in decoded, to fade in over its thumb or take the place of the story before: a picture
          // * shown once before went in with only its source and could still be empty when that was gone
          useRenderCache: false
        }),
        withoutPreloader: !props.withPreloader
      });

      result.then(async(result) => {
        if(!middleware()) return;
        if(props.childrenClassName) setChildrenClassName(result, props.childrenClassName);
        // * painted in the frame it goes in: decoded off the frame, it stayed unpainted while it faded
        // * in over its thumb and showed up whole once the fade was over
        if(props.forViewer && result.images.full instanceof HTMLImageElement) {
          result.images.full.decoding = 'sync';
        }
        await result.loadPromises.thumb;
        if(!middleware()) return;
        if(props.forViewer) {
          await readyToPaint(result.images.thumb || result.images.full);
          if(!middleware()) return;
        }
        setThumb(result.images.thumb);
        setReady(true);
        await result.loadPromises.full;
        if(!middleware()) return;
        setMedia(result.images.full);
      });

      return result;
    },

    video: (messageMedia: MessageMedia.messageMediaDocument) => {
      const {doc: document, altDoc: altDocument} = getStoryVideoDocuments(messageMedia, props.highQuality ?? true);
      const result = wrapVideo({
        ...props,
        container: div,
        doc: document,
        altDoc: altDocument,
        // ignoreStreaming: true,
        middleware,
        ...(props.forViewer && {
          // noPreview: true,
          noInfo: true,
          // noPlayButton: true,
          noAutoplayAttribute: true
        }),
        ...(props.forPreview && {
          ...(props.noAspecter && {
            photoSize: choosePhotoSize(document, 200, 200, false)
          }),
          onlyPreview: true
        }),
        withoutPreloader: !props.withPreloader
      });

      result.then(async(result) => {
        if(!middleware()) return;
        if(props.childrenClassName) {
          if(result?.thumb) setChildrenClassName(result.thumb, props.childrenClassName);
          if(result?.video) result.video.classList.add(props.childrenClassName);
        }
        if(result?.thumb) await result.thumb.loadPromises.thumb;
        if(!middleware()) return;
        const thumb = result?.thumb && (result.thumb.images.full || result.thumb.images.thumb);
        if(props.forViewer) {
          await readyToPaint(thumb);
          if(!middleware()) return;
        }
        if(thumb) setThumb(thumb as HTMLImageElement | HTMLCanvasElement);
        setReady(true);
        const video = result?.video;
        if(video && props.forViewer) {
          video.loop = false;
          video.muted = true;

          // * goes in over its thumb once it has a frame: fades in, as a photo does
          if(thumb && !video.parentElement && liteMode.isAvailable('animations')) {
            video.classList.add('fade-in');
          }

          if(IS_SAFARI) { // * force Safari to load the video
            video.load();
          }
        }
        await result?.loadPromise;
        if(!middleware()) return;

        setMedia(video);
      });

      return result;
    },

    // * media of a kind this client cannot show (a newer layer's): a note in its place, as iOS and
    // * Android have it — in the viewer, a tile has no room for one — and the story goes on by its
    // * timer, as a photo does. Ready once whoever wrapped it has started listening, as a photo is;
    // * only the viewer takes the note for its media, a tile's owner reads a photo's thumb off that
    unsupported: () => {
      const placeholder = document.createElement('div');
      placeholder.classList.add(styles.Unsupported);
      if(props.forViewer) {
        placeholder.append(i18n('Story.Unsupported'));
      }

      div.append(placeholder);
      queueMicrotask(() => {
        if(!middleware()) return;
        setReady(true);
        if(props.forViewer) setMedia(placeholder);
      });
    }
  };

  let mediaResult: ReturnType<typeof wrapPhoto | typeof wrapVideo>;
  switch(messageMedia._) {
    case 'messageMediaPhoto': {
      mediaResult = wrappers.photo(messageMedia);
      break;
    }

    case 'messageMediaDocument': {
      // if(!props.group && props.forPreview) {
      //   mediaResult = wrappers.photo(messageMedia);
      // } else {
      mediaResult = wrappers.video(messageMedia);
      // }

      break;
    }

    default: {
      wrappers.unsupported();
      break;
    }
  }

  return {container, div, media, mediaResult, thumb, ready};
};

export const StoryPreview = (props: {
  storyId: number,
  loadPromises?: Promise<any>[],
  onExpiredStory?: () => void,
} & CommonProperties) => {
  let {loadPromises} = props;
  if(loadPromises) {
    delete props.loadPromises;
  }

  const loadPromise: CancellablePromise<void> = loadPromises && deferredPromise();
  loadPromises?.push(loadPromise);
  loadPromises = undefined;

  const [storyItem, setStoryItem] = createSignal<StoryItem.storyItem>(undefined, {equals: false});
  const [f, setF] = createSignal<JSX.Element>();

  rootScope.managers.acknowledged.appStoriesManager.getStoryById(props.peerId, props.storyId)
  .then(async(result) => {
    if(!result.cached) {
      loadPromise?.resolve();
    }

    const storyItem = await result.result;
    setStoryItem(storyItem);
  });

  const onStoryItem = (storyItem: StoryItem.storyItem) => {
    if(!storyItem) {
      props.onExpiredStory?.();
      loadPromise.resolve();
      return;
    }

    onCleanup(() => {
      loadPromise?.reject();
    });

    // catchError(() => {
    //   wrapStoryMedia({
    //     ...props,
    //     storyItem,
    //     forPreview: true
    //   });
    // }, (err) => {
    //   console.error('error', err);
    // });

    const {container, ready} = wrapStoryMedia({
      ...props,
      storyItem,
      forPreview: true
    });

    createEffect(
      on(
        () => ready(),
        () => {
          loadPromise?.resolve();
          setF(container);
        },
        {defer: true}
      )
    );
  };

  createEffect(
    on(
      () => storyItem(),
      onStoryItem,
      {defer: true}
    )
  );

  return (
    <>{f}</>
  );
};
