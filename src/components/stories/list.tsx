/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {JSX, createSignal, For, createEffect, createResource, SuspenseList, Suspense, getOwner, runWithOwner, ParentComponent, Accessor, createRoot, untrack, onMount, createMemo, Owner, splitProps, onCleanup, on, Show} from 'solid-js';
import {ScrollableX} from '../scrollable';
import {createMiddleware, createStoriesViewer} from './viewer';
import styles from './list.module.scss';
import PeerTitle from '../peerTitle';
import mediaSizes from '../../helpers/mediaSizes';
import rootScope from '../../lib/rootScope';
import fastSmoothScroll from '../../helpers/fastSmoothScroll';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {animateSingle, cancelAnimationByKey} from '../../helpers/animation';
import {CancellablePromise} from '../../helpers/cancellablePromise';
import clamp from '../../helpers/number/clamp';
import debounce from '../../helpers/schedulers/debounce';
import {AvatarNew} from '../avatarNew';
import I18n, {i18n} from '../../lib/langPack';
import createContextMenu from '../../helpers/dom/createContextMenu';
import findUpClassName from '../../helpers/dom/findUpClassName';
import {StoriesProvider, useStories} from './store';
import appImManager from '../../lib/appManagers/appImManager';
import appSidebarLeft from '../sidebarLeft';
import AppMyStoriesTab from '../sidebarLeft/tabs/myStories';
import {toastNew} from '../toast';
import wrapPeerTitle from '../wrappers/peerTitle';
import liteMode from '../../helpers/liteMode';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import SwipeHandler from '../swipeHandler';

const TEST_COUNT = 0;
const STATE_FOLDED = 1;
const STATE_UNFOLDED = 0;

export const ScrollableXTsx = (props: {
  children: JSX.Element
}) => {
  let container: HTMLDivElement;
  const ret = (
    <div ref={container}>
      {props.children}
    </div>
  );

  const scrollable = new ScrollableX(undefined, undefined, undefined, undefined, container);
  return ret;
};

export const PeerTitleTsx = (props: {
  peerId: PeerId,
  onlyFirstName?: boolean
}) => {
  const peerTitle = new PeerTitle();

  const [loaded] = createResource(
    () => props.peerId,
    (peerId) => {
      // console.log('peer title', props.peerId);
      // return new Promise((resolve) => setTimeout(resolve, 1e3)).then(() => {
      // console.log('finished timeout');
      return peerTitle.update({peerId, dialog: false, onlyFirstName: props.onlyFirstName}).then(() => true);
      // });
    }
  );

  return (
    <>
      {loaded() && peerTitle.element}
    </>
  );
};

function _StoriesList(props: {
  foldInto: HTMLElement,
  setScrolledOn: HTMLElement,
  getScrollable: () => HTMLElement,
  listenWheelOn: HTMLElement,
  archive?: boolean,
  offsetX?: number,
  resizeCallback?: (callback: () => void) => void
}) {
  type PeerStories = typeof stories['peers'][0];
  const [stories, actions] = useStories();
  const [viewerPeer, setViewerPeer] = createSignal<PeerStories>();
  const [progress, _setProgress] = createSignal(STATE_FOLDED);
  const [containerRect, setContainerRect] = createSignal<DOMRect>();
  const [isTransition, setIsTransition] = createSignal(false);
  const folded = createMemo(() => progress() === STATE_FOLDED);
  const shouldStoriesSegmentsBeFolded = createMemo(() => progress() !== STATE_UNFOLDED);
  const peers = createMemo(() => {
    const peers = stories.peers;
    if(TEST_COUNT) {
      return peers.slice(0, TEST_COUNT);
    }
    return peers;
  });
  const setProgress = (progress: number, skipAnimation?: boolean) => {
    if(liteMode.isAvailable('animations') && !skipAnimation) setIsTransition(true);
    _setProgress(progress);
  };

  let toRect: DOMRect, fromRect: DOMRect;
  const myIndex = createMemo(() => peers().findIndex((peer) => peer.peerId === rootScope.myId));
  const spaceEvenly = createMemo(() => {
    const rect = containerRect();
    if(rect && rect.width > (peers().length * ITEM_WIDTH)) {
      return (rect.width - (peers().length * ITEM_WIDTH)) / (peers().length + 1);
    }

    return 0;
  });
  const items = new WeakMap<PeerStories, HTMLDivElement>();
  const itemsTarget = new WeakMap<HTMLDivElement, PeerStories>();

  const scrollTo = (wasProgress: number, open?: boolean) => {
    const startTime = Date.now();
    const _animation = animation = animateSingle(() => {
      const value = clamp((Date.now() - startTime) / 125, 0, 1);

      let progress = wasProgress;
      if((wasProgress > 0.5 || open === false) && open !== true) {
        progress += (1 - wasProgress) * value;
        animationOpening = false;
      } else {
        animationOpening = true;
        progress -= wasProgress * value;
      }

      setProgress(progress);
      return value < 1;
    }, container).finally(() => {
      if(_animation === animation) {
        animation = undefined;
      }
    });
  };

  const clearAnimation = () => {
    cancelAnimationByKey(container);
  };

  const onContainerClick = (e: MouseEvent) => {
    const wasProgress = progress();
    if(wasProgress !== STATE_UNFOLDED) {
      // scrollTo(wasProgress, true);
      clearAnimation();
      setProgress(STATE_UNFOLDED);
      cancelEvent(e);
    }
  };

  let animation: CancellablePromise<void>, animationOpening: boolean;
  const onScrolled = () => {
    return;

    const wasProgress = progress();
    if(wasProgress >= 1 || wasProgress <= 0) {
      return;
    }

    scrollTo(wasProgress);
  };

  const debounced = debounce(onScrolled, 75, false, true);

  const onMove = (delta: number, e?: WheelEvent | TouchEvent) => {
    const scrollTop = props.getScrollable().scrollTop;
    const isWheel = e instanceof WheelEvent;
    if(isWheel || true) {
      const newState = delta < 0 ? STATE_UNFOLDED : STATE_FOLDED;
      if((scrollTop && progress() !== STATE_UNFOLDED) || debounced.isDebounced()) {
        debounced();
        return;
      }

      if(progress() === newState) {
        return;
      }

      e && cancelEvent(e);
      setProgress(newState);
      return;
    }

    const wasProgress = progress();
    container.classList.add(styles.skipAnimation);

    // if user starts to scroll down when it's being opened
    if(delta > 0 && animation && animationOpening) {
      debounced.clearTimeout();
      scrollTo(wasProgress, false);
      return;
    }

    if(
      animation ||
      (wasProgress >= STATE_FOLDED && delta > 0) ||
      (wasProgress <= STATE_UNFOLDED && delta <= 0)/*  ||
      (scrollTop && progress() !== STATE_UNFOLDED) */
    ) {
      return;
    }

    // if(animation) {
    //   cancelEvent(e);
    //   return;
    // }

    let value = delta / 600;
    value = clamp(wasProgress + value, 0, 1);
    console.log('value', value);
    setProgress(value);
    if(value >= 1 || value <= 0) {
      debounced.clearTimeout();
      onScrolled();
    } else {
      e && cancelEvent(e);
      debounced();
    }
  };

  const onWheel = (e: WheelEvent) => {
    if(!peers().length) {
      return;
    }

    const wheelDeltaY = (e as any).wheelDeltaY as number;
    const delta: number = -wheelDeltaY;
    onMove(delta, e);
  };
  props.listenWheelOn.addEventListener('wheel', onWheel, {passive: false});
  onCleanup(() => {
    props.listenWheelOn.removeEventListener('wheel', onWheel);
  });

  if(IS_TOUCH_SUPPORTED) {
    const swipeHandler = new SwipeHandler({
      element: props.listenWheelOn,
      onSwipe: (xDiff, yDiff, e) => {
        const delta = -yDiff;
        onMove(delta, e as any as TouchEvent);
      },
      cancelEvent: false,
      cursor: '',
      verifyTouchTarget: (e) => {
        return e instanceof TouchEvent && peers().length && !findUpClassName(e.target, 'folders-tabs-scrollable');
      }
    });

    onCleanup(() => {
      swipeHandler.removeListeners();
    });
  }

  createEffect(() => {
    const peer = viewerPeer();
    if(!peer) {
      return;
    }

    const onExit = () => {
      setViewerPeer(undefined);
    };

    const target = createMemo(() => {
      const item = items.get(stories.peer);
      return item?.querySelector('.avatar');
    });

    createStoriesViewer({onExit, target});
  });

  const onItemClick = (peer: PeerStories, e: MouseEvent) => {
    if(progress() !== STATE_UNFOLDED) {
      return onContainerClick(e);
    }

    actions.resetIndexes();
    actions.set({peer});
    setViewerPeer(peer);
  };

  const ITEM_MARGIN = 0;
  const ITEM_WIDTH = 74 + ITEM_MARGIN * 2;
  const ITEM_AVATAR_SIZE = 54;
  const STACKED_LENGTH = 3;

  const foldedLength = createMemo(() => Math.min(STACKED_LENGTH, peers().length - (myIndex() !== -1 ? 1 : 0)));
  const indexes = createMemo(() => {
    return {
      min: myIndex() === 0 && peers().length > 1 ? 1 : 0,
      max: myIndex() === 0 ? foldedLength() : foldedLength() - 1
    };
  });

  const isItemOut = (index: number, _indexes: ReturnType<typeof indexes> = indexes()) => {
    const {min: minIndex, max: maxIndex} = _indexes;
    return index < minIndex || index > maxIndex;
  };

  const Item = (peer: PeerStories, idx: Accessor<number>) => {
    const onClick = onItemClick.bind(null, peer);

    const calculateMovement = createMemo(() => {
      const rect = containerRect();
      const value = progress();
      const index = idx();
      const marginEvenly = spaceEvenly();
      const containerPadding = marginEvenly ? 0 : CONTAINER_PADDING;

      const _indexes = indexes();
      const isOut = isItemOut(index, _indexes);
      const fromLeft = fromRect.left + containerPadding;
      const left = fromLeft + index * ITEM_WIDTH + marginEvenly * (index + 1);
      const realLeft = rect.left + containerPadding + index * ITEM_WIDTH + marginEvenly * (index + 1);
      if(realLeft > rect.right) {
        return;
      }

      const cssProperties: JSX.CSSProperties = {};
      if(isOut) {
        cssProperties['z-index'] = 100 - index;
      } else {
        cssProperties['z-index'] = 100 + foldedLength() + 1 - index;
      }

      // if(myIndex() === 0 && index !== 0) {
      //   index -= 1;
      // }

      const desiredX = toRect.right + (props.offsetX || 0);
      const indexOffsetX = isOut ? 0 : (_indexes.max - index) * 16;
      let distanceX = desiredX - left + 5 - indexOffsetX;

      let _scale: number;
      if(isOut) {
        cssProperties['transform-origin'] = 'center 43.75%';
        distanceX += 8 * (index < _indexes.min ? 1 : -1);
        _scale = 0.2;
      } else {
        _scale = 26.67 / 48;
      }

      const translateX = distanceX * value;
      const translate = `translateX(${translateX * (I18n.isRTL ? -1 : 1)}px)`;
      const scaleValue = 1 - (value * (1 - _scale));
      const scale = `scale(${scaleValue})`;
      cssProperties.transform = `${translate} ${scale}`;
      return {
        isOut,
        isLastIn: !isOut && index === _indexes.max,
        cssProperties
      };
    });

    const avatar = AvatarNew({
      peerId: peer.peerId,
      size: ITEM_AVATAR_SIZE,
      props: {
        onClick
      },
      isDialog: false,
      withStories: true,
      isStoryFolded: shouldStoriesSegmentsBeFolded
    });

    const isMyStory = peer.peerId === rootScope.myId;

    const ret = (
      <div
        ref={(el) => (items.set(peer, el), itemsTarget.set(el, peer))}
        class={styles.ListItem}
        classList={{
          [styles.isRead]: !isMyStory && peer.maxReadId && peer.maxReadId >= peer.stories[peer.stories.length - 1].id,
          [styles.isMasked]: (() => {
            const movement = calculateMovement();
            return movement && !movement.isOut && !movement.isLastIn;
          })()
        }}
        onClick={onClick}
        style={calculateMovement()?.cssProperties}
      >
        {avatar.element}
        <div class={styles.ListItemName}>
          {isMyStory ? i18n('MyStory') : <PeerTitleTsx peerId={peer.peerId} onlyFirstName />}
        </div>
      </div>
    );

    return (
      <Show when={/* isTransition() ||  */calculateMovement() || !folded()}>
        {ret}
      </Show>
    );
  };

  const MOVE_Y = -69, CONTAINER_PADDING = 6, CONTAINER_HEIGHT = 92;
  let scrolling = false;
  const calculateMovement = (): JSX.CSSProperties => {
    const value = progress();

    const scrollableX = !scrolling && getMenuScrollable();
    if(scrollableX?.scrollLeft) {
      scrolling = true;
      fastSmoothScroll({
        container: scrollableX,
        element: scrollableX,
        getElementPosition: () => -scrollableX.scrollLeft,
        position: 'start',
        axis: 'x'
      }).then(() => {
        scrolling = false;
      });
    }

    const translateY = value * MOVE_Y;
    const translate = `translateY(${translateY}px)`;
    props.setScrolledOn.style.setProperty('--stories-scrolled', (value * CONTAINER_HEIGHT) + 'px');

    return {
      // 'height': `${containerHeight - (containerHeight * value)}px`,
      'transform': translate,
      '--progress': value
      // '--scale': 1 - (value * (1 - 0.625))
    };
  };

  // * fold when stories disappear
  createEffect(
    on(
      () => peers().length,
      (length) => {
        if(!length) {
          scrollTo(progress(), false);
        }
      },
      {defer: true}
    )
  );

  const getMenuScrollable = () => container.firstElementChild as HTMLElement;

  // * lock horizontal scroll when folded
  createEffect(() => {
    if(folded() || isTransition()) {
      const onWheel = cancelEvent;
      const scrollableX = getMenuScrollable();
      scrollableX.addEventListener('wheel', onWheel, {capture: true});
      onCleanup(() => {
        scrollableX.removeEventListener('wheel', onWheel, {capture: true});
      });
    }
  });

  createEffect(() => {
    if(isTransition()) {
      return;
    }

    actions.toggleSorting('list', !folded());
  });

  const onResize = () => {
    toRect = props.foldInto.getBoundingClientRect();
    fromRect = props.foldInto.parentElement.getBoundingClientRect();
    setContainerRect(props.foldInto.parentElement.parentElement.getBoundingClientRect());
  };
  mediaSizes.addEventListener('resize', onResize);
  onCleanup(() => {
    mediaSizes.removeEventListener('resize', onResize);
  });
  onResize();
  props.resizeCallback?.(onResize);

  let container: HTMLDivElement;
  const r = (
    <div
      ref={container}
      class={styles.ListContainer}
      classList={{
        'disable-hover': folded() || isTransition(),
        [styles.skipAnimation]: folded() && !isTransition()
      }}
      style={calculateMovement()}
      onTransitionStart={(e) => e.target === container && setIsTransition(true)}
      onTransitionEnd={(e) => e.target === container && setIsTransition(false)}
    >
      <ScrollableXTsx>
        <div
          class={styles.List}
          classList={{
            [styles['space-evenly']]: !!spaceEvenly()
          }}
        >
          <For each={peers()}>{Item}</For>
        </div>
      </ScrollableXTsx>
    </div>
  );

  onMount(() => {
    const toggleMute = async(mute: boolean) => {
      rootScope.managers.appNotificationsManager.toggleStoriesMute(peer.peerId, mute);

      toastNew({
        langPackKey: mute ? 'NotificationsStoryMutedHint' : 'NotificationsStoryUnmutedHint',
        langPackArguments: [await wrapPeerTitle({peerId: peer.peerId})]
      });
    };

    const toggleHidden = async(hidden: boolean) => {
      rootScope.managers.appStoriesManager.toggleStoriesHidden(peer.peerId, hidden);

      toastNew({
        langPackKey: hidden ? 'StoriesMovedToContacts' : 'StoriesMovedToDialogs',
        langPackArguments: [await wrapPeerTitle({peerId: peer.peerId})]
      });
    };

    let peer: PeerStories, isSelf: boolean;
    createContextMenu({
      buttons: [{
        icon: 'stories',
        text: 'SavedStories',
        onClick: () => {
          appSidebarLeft.createTab(AppMyStoriesTab).open();
        },
        verify: () => isSelf
      }, {
        icon: 'archive',
        text: 'ArchivedStories',
        onClick: () => {
          const tab = appSidebarLeft.createTab(AppMyStoriesTab);
          tab.isArchive = true;
          tab.open();
        },
        verify: () => isSelf
      }, {
        icon: 'message',
        text: 'SendMessage',
        onClick: () => {
          appImManager.setInnerPeer({
            peerId: peer.peerId,
            type: 'chat'
          });
        },
        verify: () => !isSelf && peer.peerId.isUser()
      }, {
        icon: 'channel',
        text: 'OpenChannel2',
        onClick: () => {
          appImManager.setInnerPeer({
            peerId: peer.peerId,
            type: 'chat'
          });
        },
        verify: () => !peer.peerId.isUser()
      }, {
        icon: 'mute',
        text: 'NotificationsStoryMute2',
        onClick: () => toggleMute(true),
        verify: () => !isSelf && rootScope.managers.appNotificationsManager.isPeerStoriesMuted(peer.peerId).then((isMuted) => !isMuted),
        multiline: true
      }, {
        icon: 'unmute',
        text: 'NotificationsStoryUnmute2',
        onClick: () => toggleMute(false),
        verify: () => !isSelf && rootScope.managers.appNotificationsManager.isPeerStoriesMuted(peer.peerId),
        multiline: true
      }, {
        icon: 'archive',
        text: 'ArchivePeerStories',
        onClick: () => toggleHidden(true),
        verify: () => !isSelf && !props.archive
      }, {
        icon: 'unarchive',
        text: 'UnarchiveStories',
        onClick: () => toggleHidden(false),
        verify: () => !isSelf && !!props.archive
      }],
      listenTo: container,
      middleware: createMiddleware().get(),
      findElement: (e) => {
        return !folded() && findUpClassName(e.target, styles.ListItem);
      },
      onOpen: (e, target) => {
        peer = itemsTarget.get(target as HTMLDivElement);
        isSelf = peer.peerId === rootScope.myId;
      },
      onClose: () => {
        peer = undefined;
      }
    });
  });

  return (
    <>
      {stories.ready && r}
    </>
  );
}

export default function StoriesList(props: Parameters<typeof StoriesProvider>[0] & Parameters<typeof _StoriesList>[0]) {
  const [, rest] = splitProps(props, ['foldInto', 'getScrollable', 'listenWheelOn', 'setScrolledOn', 'offsetX', 'resizeCallback']);
  // return <_StoriesList />;
  return (
    <StoriesProvider {...rest}>
      <_StoriesList {...props} />
    </StoriesProvider>
  );
}
