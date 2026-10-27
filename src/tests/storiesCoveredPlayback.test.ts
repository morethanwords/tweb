vi.mock('@lib/rootScope', async() => {
  const {default: EventListenerBase} = await import('@helpers/eventListenerBase');
  const rootScope: any = new EventListenerBase();
  rootScope.managers = {
    appStoriesManager: {
      getStealthMode: () => Promise.resolve({_: 'storiesStealthMode'}),
      getListPositions: () => Promise.resolve({})
    }
  };
  return {default: rootScope};
});

import {createRoot} from 'solid-js';
import '@helpers/peerIdPolyfill';
import {createStoriesStore, StoriesContextValue} from '@components/stories/store';

const createViewer = () => createRoot((dispose) => {
  const story = {_: 'storyItem', id: 1, date: 1, pFlags: {}} as any;
  const store: StoriesContextValue = createStoriesStore({peers: [{peerId: 1 as PeerId, stories: [story], index: 0, count: 1} as any], manualLoad: true});
  store[1].viewerReady(true);
  return {store, dispose};
});

describe('a story under what covers the viewer', () => {
  it('holds still under it, and plays on once it is gone', () => {
    const {store: [state, actions], dispose} = createViewer();
    actions.play();
    actions.setCovered(true);
    expect(state.paused).toBe(true);

    actions.setCovered(false);
    expect(state.paused).toBe(false);
    dispose();
  });

  it('keeps a play asked for under it till it is gone: one popup closing as the next opens', () => {
    const {store: [state, actions], dispose} = createViewer();
    // * paused by the action that opened the first popup, which plays it on as that popup closes
    actions.pause();
    actions.setCovered(true);
    actions.play();
    expect(state.paused).toBe(true);

    actions.setCovered(false);
    expect(state.paused).toBe(false);
    dispose();
  });

  it('stays paused after it when nothing asked to play, or a pause came last', () => {
    const {store: [state, actions], dispose} = createViewer();
    actions.pause();
    actions.setCovered(true);
    actions.setCovered(false);
    expect(state.paused).toBe(true);

    actions.setCovered(true);
    actions.play();
    actions.pause();
    actions.setCovered(false);
    expect(state.paused).toBe(true);
    dispose();
  });

  it('takes the duration a play under it brings', () => {
    const {store: [state, actions], dispose} = createViewer();
    actions.setCovered(true);
    actions.play(12e3);
    expect(state.storyDuration).toBe(12e3);
    actions.setCovered(false);
    expect(state).toMatchObject({paused: false, storyDuration: 12e3});
    dispose();
  });
});
