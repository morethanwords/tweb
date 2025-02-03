/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createSignal, createEffect, on, JSX, onCleanup, catchError} from 'solid-js';
import {unwrap} from 'solid-js/store';
import rootScope from '../../lib/rootScope';
import {Photo, StoryItem, Document, MessageMedia, Message} from '../../layer';
import choosePhotoSize from '../../lib/appManagers/utils/photos/choosePhotoSize';
import wrapPhoto from '../wrappers/photo';
import wrapVideo from '../wrappers/video';
import LazyLoadQueue from '../lazyLoadQueue';
import {AnimationItemGroup} from '../animationIntersector';
import {ChatAutoDownloadSettings} from '../../helpers/autoDownload';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import {IS_SAFARI} from '../../environment/userAgent';
import createMiddleware from '../../helpers/solid/createMiddleware';

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
setInterval(pollStories, 300e3);

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
  useBlur?: boolean | number
} & CommonProperties) => {
  const [thumb, setThumb] = createSignal<HTMLImageElement | HTMLCanvasElement>();
  const [media, setMedia] = createSignal<HTMLImageElement | HTMLVideoElement>();
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
          size: choosePhotoSize(photo, Infinity, Infinity),
          // noBlur: true,
          noFadeIn: true
          // noThumb: true
        }),
        withoutPreloader: !props.withPreloader
      });

      result.then(async(result) => {
        if(!middleware()) return;
        if(props.childrenClassName) setChildrenClassName(result, props.childrenClassName);
        await result.loadPromises.thumb;
        if(!middleware()) return;
        setThumb(result.images.thumb);
        setReady(true);
        await result.loadPromises.full;
        if(!middleware()) return;
        setMedia(result.images.full);
      });

      return result;
    },

    video: (messageMedia: MessageMedia.messageMediaDocument) => {
      const document = messageMedia.document as Document.document;
      const altDocument = messageMedia.alt_documents?.[0] as Document.document; // Supposedly there is only one alt document for stories
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
        if(result?.thumb) setThumb(result.thumb.images.full as any || result.thumb.images.thumb);
        setReady(true);
        const video = result?.video;
        if(video && props.forViewer) {
          video.loop = false;
          video.muted = true;

          if(IS_SAFARI) { // * force Safari to load the video
            video.load();
          }
        }
        await result?.loadPromise;
        if(!middleware()) return;

        setMedia(video);
      });

      return result;
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
