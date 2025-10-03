/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type LazyLoadQueue from './lazyLoadQueue';
import type {PeerPhotoSize} from '../lib/appManagers/appAvatarsManager';
import type {StoriesSegment, StoriesSegments} from '../lib/appManagers/appStoriesManager';
import {getMiddleware, type Middleware} from '../helpers/middleware';
import deferredPromise from '../helpers/cancellablePromise';
import {
  createSignal,
  createEffect,
  createMemo,
  onCleanup,
  JSX,
  createRoot,
  Show,
  Accessor,
  on,
  splitProps, onMount
} from 'solid-js';
import rootScope from '../lib/rootScope';
import {NULL_PEER_ID, REPLIES_PEER_ID, HIDDEN_PEER_ID} from '../lib/mtproto/mtproto_config';
import {Chat, ChatPhoto, PhotoSize, User, UserProfilePhoto} from '../layer';
import {getPeerAvatarColorByPeer} from '../lib/appManagers/utils/peers/getPeerColorById';
import getPeerPhoto from '../lib/appManagers/utils/peers/getPeerPhoto';
import wrapAbbreviation from '../lib/richTextProcessor/wrapAbbreviation';
import getPeerInitials from './wrappers/getPeerInitials';
import liteMode from '../helpers/liteMode';
import renderImageFromUrl, {renderImageFromUrlPromise} from '../helpers/dom/renderImageFromUrl';
import getPreviewURLFromBytes from '../helpers/bytes/getPreviewURLFromBytes';
import classNames from '../helpers/string/classNames';
import {wrapTopicIcon} from './wrappers/messageActionTextNewUnsafe';
import {Modify} from '../types';
import documentFragmentToNodes from '../helpers/dom/documentFragmentToNodes';
import DashedCircle, {DashedCircleSection} from '../helpers/canvas/dashedCircle';
import findUpClassName from '../helpers/dom/findUpClassName';
import {AckedResult} from '../lib/mtproto/superMessagePort';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';
import callbackify from '../helpers/callbackify';
import Icon from './icon';
import wrapPhoto from './wrappers/photo';
import customProperties from '../helpers/dom/customProperties';
import useIsNightTheme from '../hooks/useIsNightTheme';
import currencyStarIcon from './currencyStarIcon';
import {ActiveAccountNumber} from '../lib/accounts/types';
import {getCurrentAccount} from '../lib/accounts/getCurrentAccount';
import {appSettings} from '../stores/appSettings';

const FADE_IN_DURATION = 200;
const TEST_SWAPPING = 0;

const avatarsMap: Map<string, Set<ReturnType<typeof AvatarNew>>> = new Map();
const believeMe: Map<string, Set<ReturnType<typeof AvatarNew>>> = new Map();
const seen: Set<PeerId> = new Set();

function getAvatarQueueKey(peerId: PeerId, threadId?: number) {
  return peerId + (threadId ? '_' + threadId : '');
}

const onAvatarUpdate = ({peerId, threadId}: {peerId: PeerId, threadId?: number}) => {
  const key = getAvatarQueueKey(peerId, threadId);
  const set = avatarsMap.get(key);
  if(!set?.size) {
    return;
  }

  for(const avatar of set) {
    avatar.render();
  }
};

const onAvatarStoriesUpdate = ({peerId}: {peerId: PeerId}) => {
  const key = getAvatarQueueKey(peerId);
  const set = avatarsMap.get(key);
  if(!set?.size) {
    return;
  }

  for(const avatar of set) {
    avatar.updateStoriesSegments();
  }
};

rootScope.addEventListener('avatar_update', onAvatarUpdate);
rootScope.addEventListener('peer_title_edit', async(data) => {
  if(!(await rootScope.managers.appAvatarsManager.isAvatarCached(data.peerId))) {
    onAvatarUpdate(data);
  }
});

rootScope.addEventListener('peer_stories', ({peerId}) => {
  onAvatarStoriesUpdate({peerId});
});
rootScope.addEventListener('stories_read', onAvatarStoriesUpdate);
rootScope.addEventListener('story_deleted', onAvatarStoriesUpdate);
rootScope.addEventListener('story_new', onAvatarStoriesUpdate);

const getStoriesSegments = async(peerId: PeerId, storyId?: number): Promise<AckedResult<StoriesSegments>> => {
  if(storyId) {
    const storyUnreadType = await rootScope.managers.appStoriesManager.getUnreadType(peerId, storyId);

    const segments: StoriesSegments = [{
      length: 1,
      type: storyUnreadType
    }];

    return {
      cached: true,
      result: Promise.resolve(segments)
    };
  }

  return rootScope.managers.acknowledged.appStoriesManager.getPeerStoriesSegments(peerId);
};

const createUnreadGradient = (context: CanvasRenderingContext2D, size: number, dpr: number) => {
  const gradient = context.createLinearGradient(
    size * 0.9156 * dpr,
    size * -0.05695821429 * dpr,
    size * 0.1342364286 * dpr,
    size * 1.02370714286 * dpr
  );
  gradient.addColorStop(0, customProperties.getProperty('avatar-color-story-unread-from'));
  gradient.addColorStop(1, customProperties.getProperty('avatar-color-story-unread-to'));
  return gradient;
};

const createCloseGradient = (context: CanvasRenderingContext2D, size: number, dpr: number) => {
  const gradient = context.createLinearGradient(
    size * 0.5 * dpr,
    size * 0 * dpr,
    size * 0.5 * dpr,
    size * 1 * dpr
  );
  gradient.addColorStop(0, customProperties.getProperty('avatar-color-story-close-from'));
  gradient.addColorStop(1, customProperties.getProperty('avatar-color-story-close-to'));
  return gradient;
};

export function findUpAvatar(target: Element | EventTarget) {
  let avatar = findUpClassName(target, 'avatar');
  if(avatar) avatar = findUpClassName(avatar, 'has-stories') || avatar;
  return avatar;
}

const calculateSegmentsDimensions = (s: number) => {
  const willBeSize = Math.round(s * (1 - 6 / 54));
  const totalSvgSize = s * (1 + 2 / 54);
  const multiplier = s / 54;
  const strokeWidth = 2 * multiplier;

  return {
    size: s,
    willBeSize,
    totalSvgSize,
    multiplier,
    strokeWidth
  };
};

export function wrapPhotoToAvatar(
  avatarElem: ReturnType<typeof avatarNew>,
  photo: Parameters<typeof wrapPhoto>[0]['photo'],
  boxSize: number = 100,
  photoSize?: PhotoSize
) {
  return wrapPhoto({
    container: avatarElem.node,
    message: null,
    photo,
    boxHeight: boxSize,
    boxWidth: boxSize,
    withoutPreloader: true,
    size: photoSize
  }).then((result) => {
    avatarElem.node.classList.replace('media-container', 'avatar-relative');
    avatarElem.node.style.width = avatarElem.node.style.height = '';
    [result.images.thumb, result.images.full].forEach((image) => {
      if(!image) {
        return;
      }

      image.classList.replace('media-photo', 'avatar-photo');
    });

    if(result.images.thumb) {
      result.images.thumb.classList.add('avatar-photo-thumbnail');
    }

    return result.loadPromises.thumb;
  });
}

export function StoriesSegments(props: {
  size: number,
  colors: Partial<{
    read: string
  }>,
  isStoryFolded?: Accessor<boolean>,
}) {
  const [storiesSegments, setStoriesSegments] = createSignal<StoriesSegments>();
  const storyDimensions: Accessor<ReturnType<typeof calculateSegmentsDimensions>> = createMemo((previousDimensions) => {
    if(storiesSegments() === undefined) {
      return;
    }

    if(previousDimensions?.size === props.size) {
      return previousDimensions;
    }

    return calculateSegmentsDimensions(props.size as number);
  });
  const storiesCircle = createMemo(() => {
    // if(isStoryFolded()) {
    //   return;
    // }

    const dimensions = storyDimensions();
    if(!dimensions) {
      return;
    }

    let simple: JSX.Element;
    if(props.isStoryFolded !== undefined) {
      const status = createMemo(() => {
        const segments = storiesSegments();
        const firstCloseSegment = segments.find((segment) => segment.type === 'close');
        const segment = firstCloseSegment || segments.find((segment) => segment.type === 'unread') || segments[0];
        return segment.type;
      });

      simple = (
        <div
          class="avatar-stories-simple"
          classList={{['is-' + status()]: true}}
        >

        </div>
      );
    }

    const segmentToSection = (segment: StoriesSegment, unreadAsClose?: boolean): DashedCircleSection => {
      if(segment.type === 'read') {
        return {
          color: props.colors?.read || customProperties.getProperty('avatar-color-story-read'),
          length: segment.length,
          lineWidth: dimensions.strokeWidth / 2
        };
      }

      if(segment.type === 'close' || unreadAsClose) {
        return {
          color: closeGradient ??= createCloseGradient(context, canvas.width, dpr),
          length: segment.length,
          lineWidth: dimensions.strokeWidth
        };
      } else {
        return {
          color: unreadGradient ??= createUnreadGradient(context, canvas.width, dpr),
          length: segment.length,
          lineWidth: dimensions.strokeWidth
        };
      }
    };

    const dashedCircle = new DashedCircle();
    const {canvas, context, dpr} = dashedCircle;
    dashedCircle.prepare({
      radius: dimensions.size / 2,
      gap: 4 * dimensions.multiplier,
      width: dimensions.totalSvgSize,
      height: dimensions.totalSvgSize
    });

    let unreadGradient: CanvasGradient, closeGradient: CanvasGradient;
    canvas.style.setProperty('--offset', `${(dimensions.totalSvgSize - dimensions.size) / -2}px`);
    canvas.classList.add('avatar-stories-svg');

    const render = () => {
      const segments = storiesSegments();
      const firstCloseSegment = segments.find((segment) => segment.type === 'close');
      let sections = segments.map((segment) => segmentToSection(segment, !!firstCloseSegment));
      const totalLength = sections.reduce((sum, section) => sum + section.length, 0);
      if(totalLength > 30) {
        sections = sections.map((section) => ({
          ...section,
          length: Math.floor(section.length / totalLength * 30)
        })).filter((section) => section.length > 0);
      }

      dashedCircle.render(sections);
    };

    const isNightTheme = useIsNightTheme();
    createEffect(on(
      [isNightTheme, storiesSegments],
      () => {
        unreadGradient = closeGradient = undefined;
        render();
      }
    ));

    return simple ? (
      <>
        {canvas}
        {simple}
      </>
    ) : canvas;
  });

  return {setStoriesSegments, storyDimensions, storiesCircle};
}

export const AvatarNew = (props: {
  accountNumber?: ActiveAccountNumber,
  peerId?: PeerId,
  threadId?: number,
  isDialog?: boolean,
  isBig?: boolean,
  isSubscribed?: boolean,
  peerTitle?: string,
  lazyLoadQueue?: LazyLoadQueue | false,
  wrapOptions?: WrapSomethingOptions,
  withStories?: boolean,
  storyId?: number,
  useCache?: boolean,
  size: number | 'full',
  props?: JSX.HTMLAttributes<HTMLDivElement>,
  storyColors?: Parameters<typeof StoriesSegments>[0]['colors'],
  peer?: Chat.channel | Chat.chat | User.user,
  isStoryFolded?: Accessor<boolean>,
  processImageOnLoad?: (image: HTMLImageElement) => void,
  meAsNotes?: boolean,
  onStoriesStatus?: (has: boolean) => void,
  class?: string
}) => {
  const [ready, setReady] = createSignal(false);
  const [icon, setIcon] = createSignal<Icon>();
  const [media, setMedia] = createSignal<JSX.Element>();
  const [thumb, setThumb] = createSignal<JSX.Element>();
  const [abbreviature, setAbbreviature] = createSignal<JSX.Element>();
  const [color, setColor] = createSignal<string>();
  const [isForum, setIsForum] = createSignal(false);
  const [isTopic, setIsTopic] = createSignal(false);
  const [isMonoforum, setIsMonoforum] = createSignal(false);
  const [isSubscribed, setIsSubscribed] = createSignal(false);
  const {setStoriesSegments, storyDimensions, storiesCircle} = StoriesSegments({
    size: props.size as number,
    colors: props.storyColors,
    isStoryFolded: props.isStoryFolded
  });

  const readyPromise = deferredPromise<void>();
  const readyThumbPromise = deferredPromise<void>();
  const myId = rootScope.myId;
  const managers = rootScope.managers;
  const middlewareHelper = props.wrapOptions?.middleware ? props.wrapOptions.middleware.create() : getMiddleware();
  let addedToQueue = false, lastRenderPromise: ReturnType<typeof _render>;

  onCleanup(() => {
    lastRenderPromise = undefined;
    middlewareHelper.destroy();
    readyPromise.resolve();
    cleanLastKey();

    (props.lazyLoadQueue as LazyLoadQueue)?.delete({div: node});
  });

  // const owner = getOwner();

  const _setMedia = (media?: JSX.Element) => {
    setMedia(media);
    setReady(true);
    readyPromise.resolve();
    readyThumbPromise.resolve();
  };

  const _setThumb = (thumb?: JSX.Element) => {
    setThumb(thumb);
    setReady(true);
    readyThumbPromise.resolve();
  };

  const getKey = () => getAvatarQueueKey(props.peerId, props.threadId);
  const cleanLastKey = () => {
    if(!lastKey) {
      return;
    }

    const set = believeMe.get(lastKey);
    if(set) {
      set.delete(this);
      if(!set.size) {
        believeMe.delete(lastKey);
      }
    }

    const avatarsSet = avatarsMap.get(lastKey);
    if(!avatarsSet?.delete(ret)) {
      return;
    }

    if(!avatarsSet.size) {
      avatarsMap.delete(lastKey);
    }
  };

  const putAvatar = async(options: {
    photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto,
    size: PeerPhotoSize,
    onlyThumb?: boolean
  }) => {
    const middleware = middlewareHelper.get();
    const {peerId, useCache} = props;
    const {photo, size} = options;
    const result = apiManagerProxy.loadAvatar(peerId, photo, size, props.accountNumber);
    const loadPromise = result;
    const cached = !(result instanceof Promise);

    const animate = !cached && liteMode.isAvailable('animations');
    let image: HTMLImageElement;
    const element = image = document.createElement('img');
    element.className = classNames('avatar-photo', animate && 'fade-in');

    let renderThumbPromise: Promise<void>;
    let callback: () => void;
    let thumbImage: HTMLImageElement, thumbElement: JSX.Element;
    if(cached) {
      callback = () => {
        if(!middleware()) {
          return;
        }

        _setMedia(element);
      };
    } else {
      if(size === 'photo_big') { // let's load small photo first
        const res = await putAvatar({photo, size: 'photo_small'});
        if(!middleware()) {
          return;
        }

        renderThumbPromise = res.loadThumbPromise || res.loadPromise;
        thumbImage = res.thumbImage;
      } else if(photo.stripped_thumb) {
        thumbElement = thumbImage = document.createElement('img');
        thumbImage.className = 'avatar-photo avatar-photo-thumbnail';
        const url = getPreviewURLFromBytes(photo.stripped_thumb);
        renderThumbPromise = renderImageFromUrlPromise(
          thumbImage,
          url,
          props.useCache,
          props.processImageOnLoad
        ).then(() => {
          if(media() || !middleware()) {
            return;
          }

          _setThumb(thumbElement);
        });
      }

      callback = () => {
        if(!middleware()) {
          return;
        }

        _setMedia(element);
        if(animate) {
          setTimeout(() => {
            image.classList.remove('fade-in');
            setThumb();
          }, animate ? FADE_IN_DURATION : 0);
        } else {
          setThumb();
        }
      };
    }

    const renderPromise = callbackify(loadPromise, (url) => {
      const result = renderImageFromUrl(image, url, undefined, useCache, props.processImageOnLoad);
      callbackify(result, callback);
      return result instanceof Promise ? result : Promise.resolve(result);
    });

    return {
      cached,
      loadPromise: renderPromise,
      loadThumbPromise: cached ? renderPromise : renderThumbPromise || Promise.resolve(),
      thumbImage,
      thumbElement,
      image,
      element
    };
  };

  const set = ({
    abbreviature,
    icon,
    color,
    isForum,
    isTopic,
    isSubscribed,
    isMonoforum,
    storiesSegments
  }: {
    abbreviature?: JSX.Element,
    icon?: Icon,
    color?: string,
    isForum?: boolean,
    isTopic?: boolean,
    isSubscribed?: boolean,
    isMonoforum?: boolean,
    storiesSegments?: StoriesSegments
  }) => {
    setThumb();
    setMedia();
    setIcon(icon);
    setAbbreviature(abbreviature);
    setColor(color);
    setIsForum(isForum);
    setIsTopic(isTopic);
    setIsSubscribed(isSubscribed);
    setIsMonoforum(isMonoforum);
    setStoriesSegments(storiesSegments);
  };

  const updateStoriesSegments = async() => {
    if(!props.withStories || (props.peerId === rootScope.myId && props.isDialog)) {
      return;
    }

    const segments = await (await getStoriesSegments(props.peerId, props.storyId)).result;
    if(lastRenderPromise) {
      const result = await lastRenderPromise;
      await result?.loadThumbPromise;
    }
    setStoriesSegments(segments);
  };

  const _render = async(onlyThumb?: boolean) => {
    const middleware = middlewareHelper.get();
    const {isDialog, withStories, storyId, isBig, peerTitle: title, threadId, wrapOptions} = props;

    let {peerId} = props;
    if(title !== undefined) {
      peerId = NULL_PEER_ID;
    }

    if(peerId === myId && isDialog) {
      set({
        icon: props.meAsNotes ? 'mynotes' : 'saved',
        isForum: !props.meAsNotes && appSettings.savedAsForum
      });

      !props.meAsNotes && createRoot((dispose) => {
        createEffect(
          on(
            () => appSettings.savedAsForum,
            setIsForum,
            {defer: true}
          )
        );

        middleware.onDestroy(dispose);
      });
      return;
    }

    const peer = props.peer ?? apiManagerProxy.getPeer(peerId);
    if(title) {
      const color = getPeerAvatarColorByPeer(peer);
      const abbr = wrapAbbreviation(title);
      set({
        abbreviature: documentFragmentToNodes(abbr),
        color
      });
      return;
    }

    if(threadId) {
      const topic = await managers.dialogsStorage.getForumTopic(peerId, threadId);
      set({isTopic: true});

      return wrapTopicIcon({
        ...wrapOptions,
        middleware,
        topic,
        lazyLoadQueue: false
      }).then((icon) => {
        _setMedia(icon);
        return undefined as ReturnType<typeof putAvatar>;
      });
    }

    if(!middleware()) {
      return;
    }

    if(peerId !== NULL_PEER_ID && peerId.isUser() && (peer as User.user)?.pFlags?.deleted) {
      set({color: 'archive', icon: 'deletedaccount'});
      return;
    }

    const _isForum = !!(peer as Chat.channel)?.pFlags?.forum;
    const _isSubscribed = props.isSubscribed ?? !!(peer as Chat.channel)?.subscription_until_date;
    const storiesSegmentsResult = withStories && ((peer as User.user | Chat.channel)?.stories_max_id || storyId) && await getStoriesSegments(peerId, storyId);
    const storiesSegments = storiesSegmentsResult?.cached ? await storiesSegmentsResult.result : undefined;
    if(!middleware()) {
      return;
    }

    const size: PeerPhotoSize = isBig ? 'photo_big' : 'photo_small';

    const linkedMonoforumPeer = peer?._ === 'channel' && peer.pFlags?.monoforum && peer.linked_monoforum_id ? await managers.appChatsManager.getChat(peer.linked_monoforum_id.toPeerId?.()) : undefined;

    const photo = getPeerPhoto(linkedMonoforumPeer || peer);
    const avatarAvailable = !!photo;
    const avatarRendered = avatarAvailable && !!media(); // if avatar isn't available, let's reset it
    const isAvatarCached = props.accountNumber === getCurrentAccount() && avatarAvailable && apiManagerProxy.isAvatarCached(peerId, size);
    if(!middleware()) {
      return;
    }

    let isSet = false;
    if(!avatarRendered && !isAvatarCached) {
      let color: string;
      if(peerId && (peerId !== myId || !isDialog)) {
        color = getPeerAvatarColorByPeer(peer);
      }

      if(peerId === REPLIES_PEER_ID) {
        set({color, icon: 'reply_filled'});
        return;
      }

      if(peerId === HIDDEN_PEER_ID) {
        set({color: 'violet', icon: 'author_hidden'});
        return;
      }

      const abbr = /* title ? wrapAbbreviation(title) :  */getPeerInitials(peer);
      set({
        abbreviature: documentFragmentToNodes(abbr),
        color,
        isForum: _isForum,
        isSubscribed: _isSubscribed,
        isMonoforum: !!linkedMonoforumPeer,
        storiesSegments
      });
      isSet = true;
      // return Promise.resolve(true);
    }

    if(storiesSegmentsResult && !storiesSegmentsResult.cached) {
      updateStoriesSegments();
    }

    if(avatarAvailable/*  && false */) {
      const promise = putAvatar({photo, size, onlyThumb});
      if(isSet) {
        return promise;
      }

      const changeSegments = !!storiesSegments;
      const changeForum = _isForum !== isForum();
      const changeIsSubcribed = _isSubscribed !== isSubscribed();
      promise.then(({loadThumbPromise}) => loadThumbPromise).then(() => {
        if(!middleware()) {
          return;
        }

        if(changeSegments) {
          setStoriesSegments(storiesSegments);
        }

        if(changeForum) {
          setIsForum(_isForum);
        }

        if(changeIsSubcribed) {
          setIsSubscribed(_isSubscribed);
        }

        if(TEST_SWAPPING && peerId === TEST_SWAPPING) {
          let i = true;
          setInterval(() => {
            i = !i;
            setStoriesSegments(i ? undefined : storiesSegments);
            console.log(media());
          }, 3e3);
        }
      });
      // recordPromise(promise, 'putAvatar-' + peerId);
      return promise;
    }
  };

  const processResult = (result: Awaited<ReturnType<typeof _render>>) => {
    if(!result && !isTopic()) {
      _setMedia();
    }

    lastRenderPromise = undefined;
    return result;
  };

  let lastKey: string;
  const render = async(_props?: Modify<typeof props, {size?: never, peerId?: PeerId}>) => {
    const key = getKey();
    if(key !== lastKey) {
      cleanLastKey();
      lastKey = key;

      let set = avatarsMap.get(key);
      if(!set) {
        avatarsMap.set(key, set = new Set());
      }
      set.add(ret);
    }

    if(_props?.peerId !== undefined && props.peerId !== _props.peerId) {
      node.dataset.peerId = '' + _props.peerId;
    }

    if(_props) Object.assign(props, _props);
    middlewareHelper.clean();
    const middleware = middlewareHelper.get();

    if(props.lazyLoadQueue) {
      if(!seen.has(props.peerId)) {
        if(addedToQueue) return;
        addedToQueue = true;

        const key = getKey();
        let set = believeMe.get(key);
        if(!set) {
          believeMe.set(key, set = new Set());
        }

        set.add(ret);

        props.lazyLoadQueue.push({
          div: node,
          load: () => {
            seen.add(props.peerId);
            return render();
          }
        });

        const promise = lastRenderPromise = _render(true);
        const result = await promise;
        if(!middleware()) {
          return;
        }

        return processResult(result);
      } else if(addedToQueue) {
        props.lazyLoadQueue.delete({div: node});
      }
    }

    seen.add(props.peerId);

    const promise = lastRenderPromise = _render();

    const set = believeMe.get(key);
    if(set) {
      set.delete(ret);
      const arr = Array.from(set);
      believeMe.delete(key);

      for(let i = 0, length = arr.length; i < length; ++i) {
        arr[i].render();
      }
    }

    const result = await promise;
    if(!middleware()) {
      return;
    }

    if(addedToQueue) {
      addedToQueue = false;
    }

    return processResult(result);
  };

  if(props.onStoriesStatus) {
    createEffect(() => {
      props.onStoriesStatus(!!storyDimensions());
    });
  }

  const innerClassList = (): JSX.CustomAttributes<HTMLDivElement>['classList'] => {
    return {
      'is-forum': isForum(),
      'is-topic': isTopic(),
      'is-monoforum': isMonoforum(),
      'avatar-relative': !!thumb() || isSubscribed()
    };
  };

  const classList = (): JSX.CustomAttributes<HTMLDivElement>['classList'] => {
    return {
      ...(!storiesCircle() && innerClassList()),
      'has-stories': !!storyDimensions()
    };
  };

  const style = (): JSX.HTMLAttributes<HTMLDivElement>['style'] => {
    const dimensions = storyDimensions();
    return {
      'padding': dimensions ? (dimensions.size - dimensions.willBeSize) / 2 + 'px' : undefined,
      '--size': isTopic() && props.wrapOptions.customEmojiSize.width ? props.wrapOptions.customEmojiSize.width + 'px' : undefined
    };
  };

  const inner = (
    <>
      {icon() && Icon(icon(), 'avatar-icon', 'avatar-icon-' + icon())}
      {thumb()}
      {[media(), abbreviature()].find(Boolean)}
      {isSubscribed() && currencyStarIcon({class: 'avatar-star', stroke: true})}
    </>
  );

  // ! if I remove first inner div, then it will be broken
  const wtf = (
    <Show when={storyDimensions()} fallback={inner}>
      <div>
        {storiesCircle()}
        {props.isStoryFolded !== undefined && <div class="avatar-background"></div>}
        <div
          class={`avatar avatar-like avatar-${storyDimensions().willBeSize} avatar-gradient`}
          classList={innerClassList()}
          data-color={color()}
        >
          {inner}
        </div>
      </div>
    </Show>
  );

  let node: HTMLDivElement;
  const element = (
    <div
      ref={node}
      class={`avatar avatar-like avatar-${props.size} avatar-gradient ${props.class ?? ''}`}
      classList={classList()}
      data-color={color()}
      data-peer-id={props.peerId}
      data-story-id={props.storyId}
      style={style()}
      {...(props.props || {})}
    >
      {wtf}
    </div>
  );

  const ret = {
    element,
    ready,
    readyPromise,
    readyThumbPromise,
    node,
    render,
    setIcon,
    setStoriesSegments,
    setIsSubscribed,
    updateStoriesSegments,
    set,
    color
  };

  if(
    props.peerId !== undefined ||
    props.peerTitle !== undefined ||
    props.peer !== undefined
  ) {
    render();
  }

  // let resolved = false;
  // readyThumbPromise.finally(() => {
  //   resolved = true;
  // });
  // setTimeout(() => {
  //   if(!resolved) {
  //     console.error('wtf');
  //     readyThumbPromise.resolve();
  //   }
  // }, 1e3);

  return ret;
};

export function AvatarNewTsx(props: Parameters<typeof AvatarNew>[0] & {class?: string}) {
  const el = AvatarNew(props);
  createEffect(on(() => props.peerId, () => {
    el.render()
  }));
  return el.element;
}

export function avatarNew(props: {
  middleware: Middleware
} & Parameters<typeof AvatarNew>[0]) {
  return createRoot((dispose) => {
    props.middleware.onDestroy(dispose);
    (props.wrapOptions ??= {}).middleware = props.middleware;
    return AvatarNew(props);
  });
}
