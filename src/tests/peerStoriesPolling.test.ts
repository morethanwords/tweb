import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {AppManagers} from '@lib/managers';
import canPollPeerStories, {PEER_STORIES_POLL_INTERVAL} from '@appManagers/utils/stories/canPollPeerStories';
import {User, Chat} from '@layer';
import '@helpers/peerIdPolyfill';

// * an IntersectionObserver the test moves: `see` and `lose` report what came into sight and what left it
class FakeIntersectionObserver {
  public static instances: FakeIntersectionObserver[] = [];
  public observed: Set<Element> = new Set();

  constructor(private callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this);
  }

  public observe(element: Element) {
    this.observed.add(element);
  }

  public unobserve(element: Element) {
    this.observed.delete(element);
  }

  public disconnect() {
    this.observed.clear();
  }

  public report(elements: Element[], isIntersecting: boolean) {
    this.callback(elements.map((target) => ({target, isIntersecting} as IntersectionObserverEntry)), this as any);
  }
}

const observer = () => FakeIntersectionObserver.instances[FakeIntersectionObserver.instances.length - 1];
const see = (...elements: Element[]) => observer().report(elements, true);
const lose = (...elements: Element[]) => observer().report(elements, false);

function managersMock() {
  const pollPeersStories = vi.fn((_peerIds: PeerId[]) => Promise.resolve());
  return {managers: {appStoriesManager: {pollPeersStories}} as any as AppManagers, pollPeersStories};
}

let hidden = false;

async function load() {
  vi.resetModules();
  return import('@components/stories/peerStoriesPolling');
}

function avatar() {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

describe('the stories of the peers on screen the feed does not follow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    hidden = false;
    Object.defineProperty(document, 'hidden', {configurable: true, get: () => hidden});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('are asked for in one call once a scroll settles, those in sight only', async() => {
    const {watchPeerStories} = await load();
    const {managers, pollPeersStories} = managersMock();
    const [a, b, c] = [avatar(), avatar(), avatar()];
    watchPeerStories(a, 1 as PeerId, managers);
    watchPeerStories(b, 2 as PeerId, managers);
    watchPeerStories(c, 3 as PeerId, managers);
    // * a second call for the same peer changes nothing
    watchPeerStories(a, 1 as PeerId, managers);
    expect(observer().observed.size).toBe(3);

    see(a);
    see(b);
    expect(pollPeersStories).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(pollPeersStories).toHaveBeenCalledTimes(1);
    expect(pollPeersStories.mock.calls[0][0]).toEqual([1, 2]);
  });

  it('wait while the tab is hidden, and go once it is shown', async() => {
    const {watchPeerStories} = await load();
    const {managers, pollPeersStories} = managersMock();
    const a = avatar();
    watchPeerStories(a, 1 as PeerId, managers);
    hidden = true;
    see(a);
    vi.advanceTimersByTime(PEER_STORIES_POLL_INTERVAL);
    expect(pollPeersStories).not.toHaveBeenCalled();

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pollPeersStories).toHaveBeenCalledTimes(1);
    expect(pollPeersStories.mock.calls[0][0]).toEqual([1]);
  });

  it('are offered again each interval while in sight, and nothing runs once none is', async() => {
    const {watchPeerStories, unwatchPeerStories} = await load();
    const {managers, pollPeersStories} = managersMock();
    const [a, b] = [avatar(), avatar()];
    watchPeerStories(a, 1 as PeerId, managers);
    watchPeerStories(b, 2 as PeerId, managers);
    see(a, b);
    vi.advanceTimersByTime(500);
    expect(pollPeersStories).toHaveBeenCalledTimes(1);

    lose(b);
    vi.advanceTimersByTime(PEER_STORIES_POLL_INTERVAL);
    expect(pollPeersStories).toHaveBeenCalledTimes(2);
    expect(pollPeersStories.mock.calls[1][0]).toEqual([1]);

    unwatchPeerStories(a);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(PEER_STORIES_POLL_INTERVAL * 3);
    expect(pollPeersStories).toHaveBeenCalledTimes(2);
  });

  it('are asked for once an avatar reported before it was put in comes into sight', async() => {
    const {watchPeerStories} = await load();
    const {managers, pollPeersStories} = managersMock();
    // * the topbar's and the profile's avatars are put in once their picture is ready
    const a = document.createElement('div');
    watchPeerStories(a, 1 as PeerId, managers);
    lose(a);
    expect(observer().observed.has(a)).toBe(true);

    document.body.append(a);
    see(a);
    vi.advanceTimersByTime(500);
    expect(pollPeersStories.mock.calls).toEqual([[[1]]]);
  });

  it('are asked for again when a row taken out of the document is put back, until its avatar is gone', async() => {
    const {watchPeerStories, unwatchPeerStories} = await load();
    const {managers, pollPeersStories} = managersMock();
    const a = avatar();
    watchPeerStories(a, 1 as PeerId, managers);
    see(a);
    vi.advanceTimersByTime(500);

    // * a list takes the row out and keeps it, avatar and all, to be put back
    a.remove();
    lose(a);
    expect(observer().observed.has(a)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    document.body.append(a);
    see(a);
    vi.advanceTimersByTime(500);
    expect(pollPeersStories.mock.calls).toEqual([[[1]], [[1]]]);

    unwatchPeerStories(a);
    expect(observer().observed.size).toBe(0);
  });

  it('go through the managers of the session each came from', async() => {
    const {watchPeerStories} = await load();
    const first = managersMock(), second = managersMock();
    const [a, b] = [avatar(), avatar()];
    watchPeerStories(a, 1 as PeerId, first.managers);
    watchPeerStories(b, 2 as PeerId, second.managers);
    see(a, b);
    vi.advanceTimersByTime(500);
    expect(first.pollPeersStories.mock.calls).toEqual([[[1]]]);
    expect(second.pollPeersStories.mock.calls).toEqual([[[2]]]);
  });
});

describe('canPollPeerStories', () => {
  const user = (pFlags: User.user['pFlags'], status: User.user['status'] = {_: 'userStatusRecently', pFlags: {}}) =>
    ({_: 'user', id: 5, pFlags, status} as User.user);
  const channel = (pFlags: Chat.channel['pFlags']) => ({_: 'channel', id: 6, pFlags} as Chat.channel);

  it('takes a user the feed does not bring, with a status to show', () => {
    expect(canPollPeerStories(user({}))).toBe(true);
    expect(canPollPeerStories(user({contact: true}))).toBe(false);
    expect(canPollPeerStories(user({self: true}))).toBe(false);
    expect(canPollPeerStories(user({bot: true}))).toBe(false);
    expect(canPollPeerStories(user({min: true}))).toBe(false);
    expect(canPollPeerStories(user({}, {_: 'userStatusEmpty'}))).toBe(false);
    // * someone whose status is never shown
    expect(canPollPeerStories({...user({}), status: undefined})).toBe(false);
  });

  it('takes a channel one is not in', () => {
    expect(canPollPeerStories(channel({left: true}))).toBe(true);
    expect(canPollPeerStories(channel({}))).toBe(false);
    expect(canPollPeerStories(channel({left: true, monoforum: true}))).toBe(false);
    expect(canPollPeerStories({_: 'chat', id: 7, pFlags: {}} as Chat.chat)).toBe(false);
    expect(canPollPeerStories(undefined)).toBe(false);
  });
});
