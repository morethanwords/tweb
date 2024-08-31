/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {StoriesListPosition, StoriesListType} from '../../lib/appManagers/appStoriesManager';
import {untrack, createEffect, on, createMemo, batch, onCleanup, createContext, ParentComponent, splitProps, useContext, getOwner, runWithOwner} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
import mediaSizes from '../../helpers/mediaSizes';
import clamp from '../../helpers/number/clamp';
import windowSize from '../../helpers/windowSize';
import {StoryItem, PeerStories} from '../../layer';
import StoriesCacheType from '../../lib/appManagers/utils/stories/cacheType';
import insertStory from '../../lib/appManagers/utils/stories/insertStory';
import rootScope, {BroadcastEvents} from '../../lib/rootScope';
import {STORY_DURATION, createListenerSetter} from './viewer';
import insertInDescendSortedArray from '../../helpers/array/insertInDescendSortedArray';
import {AnyFunction} from '../../types';
import findAndSplice from '../../helpers/array/findAndSplice';
import forEachReverse from '../../helpers/array/forEachReverse';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import AppStoriesManager from '../../lib/appManagers/appStoriesManager';
import untrackActions from '../../helpers/solid/untrackActions';

export type NextPrevStory = () => void;
export type ChangeStoryParams = {
  peer: StoriesContextPeerState;
  index?: number;
};

export type StoriesContextPeerState = {
  peerId: PeerId,
  stories: Array<StoryItem>,
  maxReadId?: number,
  index?: number,
  count: number
};

export type StoriesSortingFreezeType = 'list' | 'viewer';

export type StoriesContextState = {
  index: number,
  paused: boolean,
  ended: boolean,
  muted: boolean,
  loop: boolean,
  buffering: boolean,
  hideInterface: boolean,
  playAfterGesture: boolean,
  ready: boolean,
  hasViewer: boolean,
  startTime: number,
  elapsedTime: number,
  elapsedTimeOnPause: number,
  changeTimeout: number,
  storyDuration: number,
  width: number,
  height: number,
  pinned: boolean,
  archive: boolean,
  peers: StoriesContextPeerState[],
  peer: StoriesContextPeerState,
  freezedSorting: Set<StoriesSortingFreezeType>,
  getNearestStory: (next: boolean, loop?: boolean, offsetIndex?: number, offsetPeer?: StoriesContextPeerState) => ChangeStoryParams
};

export type StoriesContextActions = {
  play: (storyDuration?: number) => void,
  pause: (hideInterface?: boolean) => void,
  toggle: (play?: boolean) => void,
  stop: () => void,
  restart: () => void,
  previous: NextPrevStory,
  next: NextPrevStory,
  goToNearestStorySafe: (next: boolean) => void,
  goToNearestStory: (next: boolean) => void,
  set: (story: ChangeStoryParams) => void,
  viewerReady: (ready: boolean) => void,
  resetIndexes: () => void,
  toggleMute: () => void,
  toggleInterface: (hide: boolean) => void,
  toggleSorting: (type: StoriesSortingFreezeType, freeze: boolean) => void,
  load: () => Promise<boolean>,
  setBuffering: (buffering: boolean) => void,
  setLoop: (loop: boolean) => void
};

export type StoriesContextValue = [
  state: StoriesContextState,
  actions: StoriesContextActions
];

const createPositions = (positions: Map<PeerId, StoriesListPosition> = new Map()) => {
  // const [positions, setPositions] = createStore({} as {[peerId: PeerId]: StoriesListPosition});
  const onPosition = ({peerId, position}: BroadcastEvents['stories_position']) => {
    if(!position) {
      positions.delete(peerId);
      // setPositions(peerId, reconcile(position));
    } else {
      positions.set(peerId, position);
      // setPositions(peerId,  position);
    }
  };

  return {positions, onPosition};
};

const {positions: globalPositions, onPosition} = createPositions();
rootScope.addEventListener('stories_position', onPosition);

const createStoriesStore = (props: {
  peers?: StoriesContextPeerState[],
  index?: number,
  peerId?: PeerId,
  pinned?: boolean,
  archive?: boolean,
  onLoadCallback?: (callback: () => Promise<boolean>) => void,
  singleStory?: boolean
}): StoriesContextValue => {
  const getNearestStory = (
    next: boolean,
    loop?: boolean,
    offsetIndex = state.index,
    offsetPeer = state.peers[offsetIndex]
  ): ChangeStoryParams => {
    const offset = next ? 1 : -1;
    const newStoryIndex = offsetPeer.index + offset;
    const isPeerEnd = next ? newStoryIndex >= offsetPeer.stories.length : newStoryIndex < 0;
    const isLastPeer = next ? offsetIndex >= (state.peers.length - 1) : offsetIndex <= 0;
    if(!isPeerEnd) {
      return {
        peer: offsetPeer,
        index: newStoryIndex
      };
    } else if(!isLastPeer) {
      const newPeer = state.peers[offsetIndex + offset];
      return {
        peer: newPeer,
        index: newPeer.index
      };
    } else if(loop) {
      const newPeer = state.peers[next ? 0 : state.peers.length - 1];
      return {
        peer: newPeer,
        index: newPeer.index
      };
    }
  };

  const initialState: StoriesContextState = {
    index: props.index || 0,
    paused: true,
    ended: false,
    muted: true,
    loop: false,
    buffering: false,
    hideInterface: false,
    playAfterGesture: false,
    ready: !!props.peers,
    hasViewer: false,
    startTime: 0,
    get elapsedTime() {
      return state.elapsedTimeOnPause || Date.now() - state.startTime;
    },
    elapsedTimeOnPause: 0,
    changeTimeout: 0,
    storyDuration: 0,
    width: 0,
    height: 0,
    pinned: props.pinned,
    archive: props.archive,
    peers: props.peers || [],
    get peer() {
      return state.peers[state.index];
    },
    freezedSorting: new Set(),
    getNearestStory
  };

  let loadState: string, loaded: boolean;
  const [state, setState] = createStore(initialState);
  const singlePeerId = props.peerId || (props.peers && props.peers[0].peerId);
  const currentListType: StoriesListType = props.archive ? 'archive' : 'stories';
  const {positions, onPosition} = createPositions(new Map(globalPositions));
  const postponedPositions: Array<BroadcastEvents['stories_position']> = [];

  const getPeerInitialIndex = (peer: StoriesContextPeerState): number => {
    const maxReadId = peer.maxReadId || 0;
    const unreadIndex = peer.stories.findIndex((storyItem) => storyItem.id > maxReadId);
    return Math.max(0, unreadIndex);
  };

  const getNearestStories = (next: boolean, count: number, loop?: boolean): ChangeStoryParams[] => {
    let nearestStory: ChangeStoryParams | undefined;
    const out: ChangeStoryParams[] = [];
    for(let i = 0; i < count; ++i) {
      nearestStory = state.getNearestStory(
        next,
        loop,
        nearestStory?.peer ? state.peers.indexOf(nearestStory.peer) : undefined
      );

      if(!nearestStory) {
        break;
      }

      out.push(nearestStory);
    }

    return out;
  };

  const checkForNearestSkipped = () => {
    [
      ...getNearestStories(true, 3, false),
      ...getNearestStories(false, 3, false)
    ].forEach((params) => {
      const storyItem = params.peer.stories[params.index];
      if(storyItem?._ === 'storyItemSkipped') {
        rootScope.managers.appStoriesManager.getStoryById(params.peer.peerId, storyItem.id);
      }
    });
  };

  const load = () => {
    const {peerId, pinned, archive} = props;
    if(peerId) {
      if(pinned || archive) {
        const {peer} = state;
        const offsetId = peer ? peer.stories[peer.stories.length - 1].id : 0;
        const loadCount = 30;
        let promise: ReturnType<AppStoriesManager['getPinnedStories']> | ReturnType<AppStoriesManager['getStoriesArchive']>;
        if(pinned) {
          promise = rootScope.managers.appStoriesManager.getPinnedStories(peerId, loadCount, offsetId);
        } else {
          promise = rootScope.managers.appStoriesManager.getStoriesArchive(peerId, loadCount, offsetId);
        }
        return promise.then(({count, stories: storyItems, pinnedToTop}) => {
          if(!offsetId) {
            const peer: StoriesContextPeerState = {
              index: 0,
              peerId,
              stories: storyItems,
              count
            };

            addPeers([peer]);
            setState({ready: true});
          } else {
            setState('peers', 0, 'stories', (stories) => [...stories, ...storyItems]);
            setState('peers', 0, 'count', count);
          }

          return loaded = storyItems.length < loadCount;
        });
      }

      return rootScope.managers.appStoriesManager.getPeerStories(peerId).then((peerStories) => {
        addPeerStories([peerStories]);
        return loaded = true;
      });
    }

    return rootScope.managers.appStoriesManager.getAllStories(
      loadState ? true : undefined,
      loadState,
      archive
    ).then((storiesAllStories) => {
      loadState = storiesAllStories.state;
      loaded = !storiesAllStories.pFlags.has_more;
      addPeerStories(storiesAllStories.peer_stories);

      if(!loaded) {
        // pause(5000).then(load);
        load();
      }

      return loaded;
    });
  };

  const actions: StoriesContextActions = {
    set: (params) => {
      if(!params) {
        setState({ended: true});
        return;
      }

      const peerIndex = state.peers.indexOf(params.peer);
      // actions.stop(); // ! was working

      if(params.index !== undefined) {
        setState('peers', peerIndex, 'index', params.index);
      }

      actions.stop();

      if(state.peer !== params.peer) {
        setState({index: peerIndex});
      }

      // actions.stop(); // ! doesn't work when animations are disabled

      // setTimeout(() => {
      checkForNearestSkipped();
      // }, 1e3);
    },

    pause: (hideInterface) => {
      setState({paused: true, playAfterGesture: hideInterface && !state.paused});
      actions.toggleInterface(hideInterface);
    },

    play: (storyDuration = state.storyDuration) => {
      if(state.buffering || !state.hasViewer) {
        return;
      }

      setState({paused: false, storyDuration});
      actions.toggleInterface(false);
    },

    stop: () => {
      // clearTimeout(changeTimeout);
      actions.pause();
      setState({startTime: 0, elapsedTimeOnPause: 0});
    },

    restart: () => {
      setState({buffering: false});
      actions.stop();
      actions.play();
    },

    toggle: (play = state.paused) => {
      if(play) {
        actions.play();
      } else {
        actions.pause();
      }
    },

    previous: () => actions.goToNearestStory(false),
    next: () => actions.goToNearestStory(true),
    goToNearestStorySafe: (next: boolean) => {
      if(next) {
        actions.next();
        return;
      }

      const story = state.getNearestStory(next);
      if(!story || (state.storyDuration !== STORY_DURATION && (state.elapsedTime / state.storyDuration) > 0.5)) {
        actions.restart();
      } else {
        actions.set(story);
      }
    },
    goToNearestStory: (next: boolean) => {
      const story = state.getNearestStory(next);
      actions.set(story);
    },

    viewerReady: (ready) => {
      setState({hasViewer: ready, ended: false});
    },

    resetIndexes: () => {
      setState('peers', {}, (peer) => {
        return {index: getPeerInitialIndex(peer)};
      });
    },

    toggleMute: () => {
      setState({muted: !state.muted});
    },

    toggleInterface: (hide) => {
      setState({hideInterface: hide});
    },

    toggleSorting: (type, freeze) => {
      if(freeze) state.freezedSorting.add(type);
      else {
        state.freezedSorting.delete(type);

        if(!state.freezedSorting.size) {
          postponedPositions.splice(0, Infinity).forEach((data) => onStoriesPosition(data, true));
        } else if(type === 'viewer') {
          forEachReverse(postponedPositions, (data, idx) => {
            if(data.position && data.position.type !== currentListType) {
              postponedPositions.splice(idx, 1);
              onStoriesPosition(data, true);
            }
          });
        }
      }
    },

    load,

    setBuffering: (buffering) => {
      setState({buffering});
    },

    setLoop: (loop) => {
      setState({loop});
    }
  };

  untrackActions(actions);

  const setChangeTimeout = () => {
    clearTimeout(state.changeTimeout);
    setState({
      startTime: Date.now() - state.elapsedTimeOnPause,
      changeTimeout: window.setTimeout(() => {
        if(state.loop) {
          actions.restart();
        } else {
          actions.next();
        }
      }, state.storyDuration - state.elapsedTimeOnPause)
    });
  };

  createEffect( // * on pause or buffering
    on(
      createMemo(() => state.paused || state.buffering),
      (paused) => {
        if(paused) {
          clearTimeout(state.changeTimeout);
          setState({elapsedTimeOnPause: Date.now() - state.startTime});
        } else {
          setChangeTimeout();
        }
      },
      {defer: true}
    )
  );

  const listenerSetter = createListenerSetter();

  // * size section
  const calculateStoryHeight = () => {
    return windowSize.height - 48 - 8 - 8 * 2 - 8;
  };

  const calculateStoryWidth = (height = calculateStoryHeight()) => {
    const ratio = 9 / 16;
    return Math.min(windowSize.width, height * ratio);
  };

  const calculateSize = () => {
    const height = calculateStoryHeight();
    return {width: calculateStoryWidth(height), height};
  };

  const onResize = () => {
    setState(calculateSize());
  };

  createEffect(onResize);
  // * size section end

  const getPeerIndex = (peerId: PeerId, peers = state.peers) => {
    return peers.findIndex((peer) => peer.peerId === peerId);
  };

  const userStoriesToPeer = (peerStories: PeerStories): StoriesContextPeerState => {
    const peer: StoriesContextPeerState = {
      // index: 0,
      peerId: getPeerId(peerStories.peer),
      stories: peerStories.stories,
      maxReadId: peerStories.max_read_id,
      count: peerStories.stories.length
    };

    peer.index = getPeerInitialIndex(peer);
    return peer;
  };

  const addPeers = (addPeers: StoriesContextPeerState[]) => {
    const modifyIndexes: {peerId: PeerId; index: number}[] = [];
    let modifyCurrentIndex = state.index;

    const peers = state.peers.slice();
    const previousPeers = new Map(peers.map((peer, idx) => [peer.peerId, idx]));
    const currentPeerId = state.peer?.peerId;
    const currentIndex = previousPeers.get(currentPeerId) ?? -1;
    for(const peer of addPeers) {
      // const sortIndex = positions.get(peer.peerId).index;
      // if(!sortIndex) {
      //   continue;
      // }

      const previousPeerIdx = previousPeers.get(peer.peerId) ?? -1;
      const previousPeer = peers[previousPeerIdx];
      const newIndex = clamp(previousPeer?.index || getPeerInitialIndex(peer), 0, peer.stories.length - 1);

      if(peer.index !== newIndex) {
        modifyIndexes.push({peerId: peer.peerId, index: newIndex});
        // peer.index = newIndex;
      }

      if(previousPeerIdx !== -1) {
        peers[previousPeerIdx] = peer;
      }

      insertInDescendSortedArray(peers, peer, (peer) => {
        const position = positions.get(peer.peerId);
        return position?.index ?? 0;
      }, previousPeerIdx);
    }

    if(currentIndex !== -1) {
      const newCurrentIndex = getPeerIndex(currentPeerId, peers);
      if(newCurrentIndex !== currentIndex) {
        modifyCurrentIndex = newCurrentIndex;
      }
    }

    batch(() => {
      setState('peers', reconcile(peers, {key: 'peerId', merge: true}));
      setState({
        // peers,
        index: modifyCurrentIndex
      });

      for(const {peerId, index} of modifyIndexes) {
        const peerIndex = getPeerIndex(peerId, peers);
        setState('peers', peerIndex, 'index', index);
      }
    });
  };

  const canAddPeer = (peerId: PeerId) => {
    if(singlePeerId) {
      return singlePeerId === peerId;
    }

    const position = positions.get(peerId);
    if(!position) {
      return false;
    }

    return position.type === currentListType;
  };

  const addPeerStories = (peerStories: PeerStories[]) => {
    const peers = peerStories.map(userStoriesToPeer);
    addPeers(peers);
    setState({ready: true});
  };

  const deletePeer = (peerId: PeerId, peerIndex = getPeerIndex(peerId)) => {
    if(peerIndex === -1) {
      return;
    }

    const isActive = state.index === peerIndex;
    batch(() => {
      const newPeers = state.peers.slice();
      newPeers.splice(peerIndex, 1);
      const newIndex = state.index > peerIndex ? state.index - 1 : state.index;
      setState({
        peers: newPeers,
        ...(newPeers.length ? {} : {ended: true}),
        ...(newIndex < newPeers.length ? {index: newIndex} : {ended: true})
      });

      if(isActive) {
        actions.restart();
      }
    });
  };

  // * updates section
  const onStoryUpdate = ({peerId, story, modifiedPinned, modifiedArchive, modifiedPinnedToTop}: BroadcastEvents['story_update']) => {
    const peerIndex = getPeerIndex(peerId);
    if(peerIndex === -1) {
      return;
    }

    const peer = state.peers[peerIndex];
    const storyIndex = peer.stories.findIndex((s) => s.id === story.id);

    if(props.pinned && modifiedPinned) {
      if(!(story as StoryItem.storyItem).pFlags.pinned) {
        onStoryDeleted({peerId, id: story.id});
      } else {
        onStoryNew({peerId, story, cacheType: StoriesCacheType.Pinned, maxReadId: peer.maxReadId});
      }

      return;
    }

    // * change position of story
    if(props.pinned && modifiedPinnedToTop) {
      const pinnedIndex = (story as StoryItem.storyItem).pinnedIndex;
      if( // * if story is unpinned and it should be far far away
        pinnedIndex === undefined &&
        story.id < peer.stories[peer.stories.length - 1].id &&
        !loaded
      ) {
        onStoryDeleted({peerId, id: story.id});
        return;
      }

      if(storyIndex === -1) {
        onStoryNew({peerId, story, cacheType: StoriesCacheType.Pinned, maxReadId: peer.maxReadId});
      } else {
        setState('peers', peerIndex, 'stories', reconcile(((stories) => {
          stories = stories.slice();
          stories.splice(storyIndex, 1);
          insertStory(stories, story, false, StoriesCacheType.Pinned);
          return stories;
        })(peer.stories), {key: 'id', merge: true}));
      }
      return;
    }

    if(storyIndex === -1) {
      if(props.archive && singlePeerId && modifiedArchive) {
        onStoryNew({peerId, story, cacheType: StoriesCacheType.Archive, maxReadId: peer.maxReadId});
      }

      return;
    }

    setState('peers', peerIndex, 'stories', storyIndex, reconcile(story));
  };

  const onStoriesStories = (peerStories: PeerStories) => {
    const peerId = getPeerId(peerStories.peer);
    if(!canAddPeer(peerId)) {
      return;
    }

    addPeerStories([peerStories]);
  };

  const onStoryNew = ({peerId, story, cacheType, maxReadId}: BroadcastEvents['story_new']) => {
    if(!canAddPeer(peerId)) {
      return;
    }

    if(props.pinned && !(story as StoryItem.storyItem).pFlags?.pinned) {
      return;
    }

    const peerIndex = getPeerIndex(peerId);
    if(peerIndex === -1) {
      const peer: StoriesContextPeerState = {
        peerId,
        stories: [story],
        maxReadId,
        count: 1
      };
      peer.index = getPeerInitialIndex(peer);
      addPeers([peer]);
      return;
    }

    const peer = state.peers[peerIndex];
    const stories = peer.stories;
    const storyIndex = stories.findIndex((s) => s.id === story.id);
    if(storyIndex !== -1) {
      setState('peers', peerIndex, 'stories', storyIndex, story);
      return;
    }

    batch(() => {
      const currentStoryIndex = state.peer.index;
      let insertedAt: number;
      setState('peers', peerIndex, 'stories', (stories) => {
        stories = stories.slice();
        insertedAt = insertStory(stories, story, false, cacheType);
        return stories;
      });

      setState('peers', peerIndex, 'count', (count) => count + 1);

      if(insertedAt <= currentStoryIndex) {
        setState('peers', peerIndex, 'index', (index) => index + 1);
      }
    });
  };

  const onStoryDeleted = ({peerId, id}: {peerId: PeerId, id: number}) => {
    const peerIndex = getPeerIndex(peerId);
    if(peerIndex === -1) {
      return;
    }

    const peer = state.peers[peerIndex];
    const stories = peer.stories;
    const storyIndex = stories.findIndex((s) => s.id === id);
    if(storyIndex === -1) {
      return;
    }

    if(stories.length === 1) {
      deletePeer(peerId, peerIndex);
      return;
    }

    batch(() => {
      if(state.peer === peer && peer.index === storyIndex) {
        actions.next();
      }

      setState('peers', peerIndex, 'stories', (stories) => {
        stories = stories.slice();
        stories.splice(storyIndex, 1);
        return stories;
      });

      setState('peers', peerIndex, 'count', (count) => count - 1);

      if(peer.index >= storyIndex) {
        setState('peers', peerIndex, 'index', peer.index - 1);
      }
    });
  };

  const onStoriesRead = ({peerId, maxReadId}: BroadcastEvents['stories_read']) => {
    const peerIndex = getPeerIndex(peerId);
    if(peerIndex === -1) {
      return;
    }

    setState('peers', peerIndex, 'maxReadId', maxReadId);
  };

  // const onUserStoriesHidden = ({userId, hidden}: BroadcastEvents['user_stories_hidden']) => {
  //   const peerId = userId.toPeerId(false);
  //   const peerIndex = getPeerIndex(peerId);
  //   if(peerIndex === -1) {
  //     return;
  //   }

  //   if((props.archive && !hidden) || (!props.archive && hidden)) {
  //     deletePeer(peerId);
  //   }
  // };

  const onStoriesPosition = (data: BroadcastEvents['stories_position'], ignoreFreezed?: boolean) => {
    const {peerId, position} = data;
    if(state.freezedSorting.size && !ignoreFreezed) {
      const previousPosition = positions.get(peerId);
      if(previousPosition?.type === position?.type || (state.hasViewer && previousPosition && position)) {
        findAndSplice(postponedPositions, (data) => data.peerId === peerId);
        postponedPositions.push(data);
        return;
      }
    }

    onPosition(data);

    if(!canAddPeer(peerId)) {
      deletePeer(peerId);
      return;
    }

    const peer = state.peers.find((p) => p.peerId === peerId);
    if(!peer) {
      return;
    }

    addPeers([peer]);
  };

  listenerSetter.add(rootScope)('story_update', onStoryUpdate);
  listenerSetter.add(rootScope)('story_deleted', onStoryDeleted);
  if(!props.archive && !props.pinned) {
    listenerSetter.add(rootScope)('story_expired', onStoryDeleted);
  }
  if(!props.singleStory) {
    listenerSetter.add(rootScope)('story_new', onStoryNew);
  }
  if(!singlePeerId) {
    listenerSetter.add(rootScope)('stories_stories', onStoriesStories);
    listenerSetter.add(rootScope)('stories_read', onStoriesRead);
    // listenerSetter.add(rootScope)('user_stories_hidden', onUserStoriesHidden);
    listenerSetter.add(rootScope)('stories_position', onStoriesPosition);
  }
  // * updates section end

  if(props.onLoadCallback) {
    props.onLoadCallback(actions.load);
  } else if(!state.ready) {
    actions.load();
  } else if(state.peer.index === undefined) {
    actions.resetIndexes();
  }

  return [state, actions];
};

// const storiesStore = createStoriesStore();
const StoriesContext = createContext<StoriesContextValue>(/* storiesStore */);
export const StoriesProvider: ParentComponent<Parameters<typeof createStoriesStore>[0]> = (props) => {
  const [, rest] = splitProps(props, ['peers', 'index', 'peerId', 'pinned', 'archive']);
  return (
    <StoriesContext.Provider value={createStoriesStore(props)}>
      {props.children}
    </StoriesContext.Provider>
  );
}

export const useStories = () => useContext(StoriesContext);
