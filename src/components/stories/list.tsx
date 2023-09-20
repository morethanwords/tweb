/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {JSX, createSignal, For, createEffect, createResource, SuspenseList, Suspense, getOwner, runWithOwner, ParentComponent, Accessor, createRoot, untrack, onMount, createMemo, Owner, splitProps, onCleanup, on} from 'solid-js';
import {ScrollableX} from '../scrollable';
import {createMiddleware, createStoriesViewer} from './viewer';
import styles from './list.module.scss';
import PeerTitle from '../peerTitle';
import mediaSizes from '../../helpers/mediaSizes';
import rootScope from '../../lib/rootScope';
import fastSmoothScroll from '../../helpers/fastSmoothScroll';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {animateSingle} from '../../helpers/animation';
import {CancellablePromise} from '../../helpers/cancellablePromise';
import clamp from '../../helpers/number/clamp';
import debounce from '../../helpers/schedulers/debounce';
import {AvatarNew} from '../avatarNew';
import {i18n} from '../../lib/langPack';
import createContextMenu from '../../helpers/dom/createContextMenu';
import findUpClassName from '../../helpers/dom/findUpClassName';
import {StoriesProvider, useStories} from './store';
import appImManager from '../../lib/appManagers/appImManager';
import appSidebarLeft from '../sidebarLeft';
import AppMyStoriesTab from '../sidebarLeft/tabs/myStories';

const TEST_COUNT = 0;

const ScrollableXTsx = (props: {
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

// const AvatarTsx = (props: {
//   peerId: PeerId,
//   size: number
// } & JSX.HTMLAttributes<HTMLElement>) => {
//   const avatarElement = new AvatarElement();
//   avatarElement.classList.add('avatar-' + props.size);

//   const [, rest] = splitProps(props, ['peerId', 'size']);

//   const [loaded] = createResource(
//     () => props.peerId,
//     (peerId) => {
//       return avatarElement.updateWithOptions({
//         peerId,
//         isDialog: false,
//         withStories: true
//       }).then(() => true);
//     }
//   );

//   return (
//     <Passthrough element={avatarElement} {...rest} />
//   );
// };

const PeerTitleTsx = (props: {
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
  offsetX?: number
}) {
  type PeerStories = typeof stories['peers'][0];
  const [stories, actions] = useStories();
  const [viewerPeer, setViewerPeer] = createSignal<PeerStories>();
  const [progress, setProgress] = createSignal(1);
  const [containerRect, setContainerRect] = createSignal<DOMRect>();
  const folded = createMemo(() => progress() === 1);
  const peers = createMemo(() => {
    const peers = stories.peers;
    if(TEST_COUNT) {
      return peers.slice(0, TEST_COUNT);
    }
    return peers;
  });

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

  const onContainerClick = (e: MouseEvent) => {
    const wasProgress = progress();
    if(wasProgress > 0) {
      scrollTo(wasProgress, true);
      cancelEvent(e);
    }
  };

  let animation: CancellablePromise<void>, animationOpening: boolean;
  const onScrolled = () => {
    // return;
    const wasProgress = progress();
    if(wasProgress >= 1 || wasProgress <= 0) {
      return;
    }

    scrollTo(wasProgress);
  };

  const debounced = debounce(onScrolled, 100, false, true);
  const onWheel = (e: WheelEvent) => {
    // if(findUpClassName(e.target, 'folders-tabs-scrollable')) {
    //   return;
    // }

    if(!peers().length) {
      return;
    }

    const delta: number = -(e as any).wheelDeltaY;
    const scrollTop = props.getScrollable().scrollTop;
    const wasProgress = progress();

    // if user starts to scroll down when it's being opened
    if(delta > 0 && animation && animationOpening) {
      debounced.clearTimeout();
      scrollTo(wasProgress, false);
      return;
    }

    if(
      animation ||
      (wasProgress >= 1 && delta > 0) ||
      (wasProgress <= 0 && delta <= 0) ||
      scrollTop
    ) {
      return;
    }

    // if(animation) {
    //   cancelEvent(e);
    //   return;
    // }

    let value = delta / 600;
    value = clamp(wasProgress + value, 0, 1);
    setProgress(value);
    if(value >= 1 || value <= 0) {
      debounced.clearTimeout();
      onScrolled();
    } else {
      cancelEvent(e);
      debounced();
    }
  };
  props.listenWheelOn.addEventListener('wheel', onWheel, {passive: false});
  onCleanup(() => {
    props.listenWheelOn.removeEventListener('wheel', onWheel);
  });

  createEffect(() => {
    const peer = viewerPeer();
    if(!peer) {
      return;
    }

    const onExit = () => {
      setViewerPeer(undefined);
    };

    const target = createMemo(() => {
      return items.get(stories.peer).querySelector('.avatar');
    });

    createStoriesViewer({onExit, target});
  });

  const onItemClick = (peer: PeerStories, e: MouseEvent) => {
    if(progress() > 0) {
      return onContainerClick(e);
    }

    actions.resetIndexes();
    actions.set({peer});
    setViewerPeer(peer);
  };

  const ITEM_MARGIN = 0;
  const ITEM_WIDTH = 74 + ITEM_MARGIN * 2;
  const ITEM_AVATAR_SIZE = 54;

  const Item = (peer: PeerStories, idx: Accessor<number>) => {
    const onClick = onItemClick.bind(null, peer);

    const calculateMovement = (): JSX.CSSProperties => {
      const rect = containerRect();
      const cssProperties: JSX.CSSProperties = {};
      const value = progress();
      const index = idx();
      const marginEvenly = spaceEvenly();
      const containerPadding = marginEvenly ? 0 : CONTAINER_PADDING;

      const minIndex = myIndex() === 0 ? 1 : 0;
      const maxIndex = myIndex() === 0 ? foldedLength() : foldedLength() - 1;
      const isOut = index < minIndex || index > maxIndex;
      const fromLeft = fromRect.left + containerPadding;
      const left = fromLeft + index * ITEM_WIDTH + marginEvenly * (index + 1);
      const realLeft = rect.left + containerPadding + index * ITEM_WIDTH + marginEvenly * (index + 1);
      if(realLeft > rect.right) {
        return cssProperties;
      }

      if(isOut) {
        cssProperties['z-index'] = isOut ? 0 : 1;
      } else {
        cssProperties['z-index'] = foldedLength() + 1 - index;
      }

      if(!fromRect) {
        return cssProperties;
      }

      // if(myIndex() === 0 && index !== 0) {
      //   index -= 1;
      // }

      const desiredX = toRect.right + (props.offsetX || 0);
      const indexOffsetX = isOut ? 0 : (maxIndex - index) * 16;
      let distanceX = desiredX - left + 5 - indexOffsetX;

      let _scale: number;
      if(isOut) {
        distanceX += 8 * (index < minIndex ? 1 : -1);
        _scale = 0.2;
      } else {
        _scale = 26 / 48;
      }

      const translateX = distanceX * value;
      const translate = `translateX(${translateX}px)`;
      const scaleValue = 1 - (value * (1 - _scale));
      const scale = `scale(${scaleValue})`;
      avatar.setIsStoryFolded(value !== 0);
      // avatar.setSize(54 * scaleValue);

      // if(index() === 0) {
      //   console.table([{left, desiredX, distanceX, translateX}]);
      // }

      cssProperties.transform = `${translate} ${scale}`;
      // if(isOut) {
      //   cssProperties.opacity = 1 - value;
      // }

      return cssProperties;
    };

    const avatar = AvatarNew({
      peerId: peer.peerId,
      size: ITEM_AVATAR_SIZE,
      props: {
        onClick
      },
      isDialog: false,
      withStories: true
    });

    const isMyStory = peer.peerId === rootScope.myId;

    return (
      <div
        ref={(el) => (items.set(peer, el), itemsTarget.set(el, peer))}
        class={styles.ListItem}
        classList={{[styles.isRead]: !isMyStory && !peer.stories.some((story) => story.id > peer.maxReadId)}}
        onClick={onClick}
        style={calculateMovement()}
      >
        {avatar.element}
        <div class={styles.ListItemName}>
          {isMyStory ? i18n('MyStory') : <PeerTitleTsx peerId={peer.peerId} onlyFirstName />}
        </div>
      </div>
    );
  };

  const foldedLength = createMemo(() => Math.min(3, peers().length - (myIndex() !== -1 ? 1 : 0)));
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
    if(folded()) {
      const onWheel = cancelEvent;
      const scrollableX = getMenuScrollable();
      scrollableX.addEventListener('wheel', onWheel, {capture: true});
      onCleanup(() => {
        scrollableX.removeEventListener('wheel', onWheel, {capture: true});
      });
    }
  });

  createEffect(() => {
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

  let container: HTMLDivElement;
  const r = (
    <div
      ref={container}
      class={styles.ListContainer}
      classList={{'disable-hover': folded()}}
      style={calculateMovement()}
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
    const toggleMute = (mute: boolean) => {
      rootScope.managers.appNotificationsManager.toggleStoriesMute(peer.peerId, mute);
    };

    const toggleHidden = (hidden: boolean) => {
      rootScope.managers.appStoriesManager.toggleStoriesHidden(peer.peerId, hidden);
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
        verify: () => !isSelf
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
      onOpen: (target) => {
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

const MySuspense: ParentComponent<{}> = (props) => {
  const ret = (
    <Suspense>
      {props.children}
    </Suspense>
  );

  const signal = ret as any as Accessor<JSX.Element>;
  const [yo, setYo] = createSignal(false);

  createEffect(() => {
    if(signal()) {
      setYo(true);
    }

    console.log('wtf', signal());
  });

  return (
    <>
      {yo() || signal() ? props.children : undefined}
    </>
  );
};

export default function StoriesList(props: Parameters<typeof StoriesProvider>[0] & Parameters<typeof _StoriesList>[0]) {
  const [, rest] = splitProps(props, ['foldInto', 'getScrollable', 'listenWheelOn', 'setScrolledOn', 'offsetX']);
  // return <_StoriesList />;
  return (
    <StoriesProvider {...rest}>
      <_StoriesList {...props} />
    </StoriesProvider>
  );
}
