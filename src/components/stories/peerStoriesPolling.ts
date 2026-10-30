import type {AppManagers} from '@lib/managers';
import createAppWindowIntersectionObserver from '@helpers/dom/createAppWindowIntersectionObserver';
import {bindActiveWindowListener, getAppWindow} from '@helpers/appWindow';
import {PEER_STORIES_POLL_INTERVAL} from '@appManagers/utils/stories/canPollPeerStories';
import noop from '@helpers/noop';

/*
 * What the peers on screen that the story feed does not follow (`canPollPeerStories`) have in stories, kept up
 * to date as the other apps keep it (iOS `AccountViewTracker.refreshStoryStatsForPeerIds`, Android
 * `UserListPoller`, Web A `usePeerStoriesPolling`): their avatars say when they come into sight, and the peers
 * seen since the last flush go to the worker in one call (`appStoriesManager.pollPeersStories`), which asks the
 * server for each at most once an interval. While some stay in sight they are offered again each interval;
 * nothing is sent while the tab is hidden, and nothing runs once none is in sight.
 */

// * a scroll through a list sends its peers once it settles, as Android (300 ms) and Web A (500 ms) do
const FLUSH_DELAY = 500;

type Watched = {peerId: PeerId, managers: AppManagers};

const watched: Map<Element, Watched> = new Map();
const inSight: Set<Element> = new Set();
// * by the managers of the account session each came from: those of a session that is over send nothing
const pending: Map<AppManagers, Set<PeerId>> = new Map();
let flushTimeout: number, repollTimeout: number, stopWaitingForShow: () => void;

const observer = createAppWindowIntersectionObserver((entries) => {
  for(const {target, isIntersecting} of entries) {
    const item = watched.get(target);
    if(!item) {
      continue;
    }

    if(isIntersecting) {
      inSight.add(target);
      addPending(item);
    } else {
      // * out of the document is only out of sight: an avatar put in once its picture is ready (the topbar's, the
      // * profile's) is first reported before that, and a row a list takes out keeps its avatar to be put back -
      // * an avatar is let go of when it is (`unwatchPeerStories`), not when it leaves the document
      inSight.delete(target);
    }
  }

  if(!inSight.size) {
    stopRepoll();
  }

  scheduleFlush();
});

function addPending({peerId, managers}: Watched) {
  let peerIds = pending.get(managers);
  if(!peerIds) {
    pending.set(managers, peerIds = new Set());
  }

  peerIds.add(peerId);
}

function scheduleFlush() {
  if(!pending.size || flushTimeout || stopWaitingForShow) {
    return;
  }

  flushTimeout = window.setTimeout(flush, FLUSH_DELAY);
}

function flush() {
  clearTimeout(flushTimeout);
  flushTimeout = undefined;
  if(getAppWindow().document.hidden) {
    stopWaitingForShow ??= bindActiveWindowListener((win) => win.document, 'visibilitychange', () => {
      if(getAppWindow().document.hidden) {
        return;
      }

      stopWaitingForShow();
      stopWaitingForShow = undefined;
      flush();
    });
    return;
  }

  for(const [managers, peerIds] of pending) {
    managers.appStoriesManager.pollPeersStories([...peerIds]).catch(noop);
  }

  pending.clear();
  scheduleRepoll();
}

function stopRepoll() {
  clearTimeout(repollTimeout);
  repollTimeout = undefined;
}

function scheduleRepoll() {
  if(!inSight.size || repollTimeout) {
    return;
  }

  repollTimeout = window.setTimeout(() => {
    repollTimeout = undefined;
    inSight.forEach((element) => addPending(watched.get(element)));
    if(pending.size) {
      flush();
    }
  }, PEER_STORIES_POLL_INTERVAL);
}

/**
 * Watches `element`, an avatar of `peerId`, for coming into sight; a second call for it moves it to another
 * peer. `managers` are those of the account session it is shown in.
 */
export function watchPeerStories(element: HTMLElement, peerId: PeerId, managers: AppManagers) {
  const item = watched.get(element);
  if(item?.peerId === peerId && item.managers === managers) {
    return;
  }

  if(item) {
    unwatchPeerStories(element);
  }

  watched.set(element, {peerId, managers});
  observer.observe(element);
}

/** Stops watching `element`: its avatar is gone, shows another peer, or one no longer polled. */
export function unwatchPeerStories(element: Element) {
  if(!watched.delete(element)) {
    return;
  }

  observer.unobserve(element);
  if(inSight.delete(element) && !inSight.size) {
    stopRepoll();
  }
}
