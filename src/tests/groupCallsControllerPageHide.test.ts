/*
 * A tab closed mid-call posts a leave. The browser tears the media stack down
 * by itself; what the server needs is the leave, or the closed tab lingers as a
 * ghost participant — still listed, still holding a chain key in a conference —
 * until it times out. The SharedWorker outlives the tab, so the request gets
 * out. Nothing else runs at pagehide: no local teardown, never a discard.
 */

import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';

vi.mock('@components/groupCall/getAudioAsset', () => ({
  default: () => ({
    createAudio: vi.fn(),
    play: vi.fn(),
    stop: vi.fn(),
    playWithTimeout: vi.fn(),
    cancelDelayedPlay: vi.fn()
  })
}));
vi.mock('@lib/calls/e2e/encryptWorkerHost', () => ({EncryptWorkerHost: class {}}));
vi.mock('@lib/calls/groupCallInstance', () => ({default: class {}}));

import {GroupCallsController} from '@lib/calls/groupCallsController';
import type {InputGroupCall} from '@layer';

const ACCEPTED: InputGroupCall = {_: 'inputGroupCall', id: '700', access_hash: '701'};
const CACHED: InputGroupCall = {_: 'inputGroupCall', id: '800', access_hash: '801'};

const appGroupCallsManager = {
  leaveGroupCall: vi.fn(async() => {}),
  discardGroupCall: vi.fn(async() => {})
};
let controller: GroupCallsController;

// One controller, constructed once — production registers exactly one listener.
beforeAll(() => {
  controller = new GroupCallsController();
  controller.construct({appGroupCallsManager} as any);
});

afterEach(() => {
  (controller as any).currentGroupCall = undefined;
  vi.clearAllMocks();
});

function instanceWith(main?: Record<string, unknown>, cachedInput: InputGroupCall | null = CACHED) {
  return {
    connections: main ? {main} : {},
    toInputGroupCall: vi.fn(() => cachedInput ?? undefined),
    hangUp: vi.fn(async() => {}),
    cleanup: vi.fn()
  };
}

function pagehide() {
  window.dispatchEvent(new Event('pagehide'));
}

describe('GroupCallsController — leave on tab close', () => {
  it('posts one leave for the accepted call reference and our audio source', () => {
    const instance = instanceWith({acceptedCallInput: ACCEPTED, sources: {audio: {source: 777}}});
    (controller as any).currentGroupCall = instance;

    pagehide();

    expect(appGroupCallsManager.leaveGroupCall).toHaveBeenCalledTimes(1);
    expect(appGroupCallsManager.leaveGroupCall).toHaveBeenCalledWith(ACCEPTED, 777);
    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(instance.cleanup).not.toHaveBeenCalled();
    expect(appGroupCallsManager.discardGroupCall).not.toHaveBeenCalled();
  });

  it('falls back to the cached call identity for a legacy voice chat', () => {
    (controller as any).currentGroupCall = instanceWith({sources: {audio: {source: 5}}});

    pagehide();

    expect(appGroupCallsManager.leaveGroupCall).toHaveBeenCalledWith(CACHED, 5);
  });

  it('sends source 0 while no audio source has been allocated', () => {
    (controller as any).currentGroupCall = instanceWith();

    pagehide();

    expect(appGroupCallsManager.leaveGroupCall).toHaveBeenCalledWith(CACHED, 0);
  });

  it('does nothing without a current call', () => {
    pagehide();

    expect(appGroupCallsManager.leaveGroupCall).not.toHaveBeenCalled();
  });

  it('does nothing for a call whose identity is not known yet', () => {
    (controller as any).currentGroupCall = instanceWith(undefined, null);

    pagehide();

    expect(appGroupCallsManager.leaveGroupCall).not.toHaveBeenCalled();
  });

  it('swallows a rejected leave — the page is going away either way', async() => {
    appGroupCallsManager.leaveGroupCall.mockRejectedValueOnce(new Error('GROUPCALL_JOIN_MISSING'));
    (controller as any).currentGroupCall = instanceWith({acceptedCallInput: ACCEPTED, sources: {}});

    pagehide();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(appGroupCallsManager.leaveGroupCall).toHaveBeenCalledTimes(1);
  });
});
