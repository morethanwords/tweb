import {afterEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  fastRafCallbacks: [] as Array<() => void>,
  rows: [] as HTMLLIElement[],
  icons: [] as Array<{destroy: ReturnType<typeof vi.fn>, setState: ReturnType<typeof vi.fn>}>,
  statuses: [] as Array<{setState: ReturnType<typeof vi.fn>}>,
  middlewareHelpers: [] as Array<{
    clean: ReturnType<typeof vi.fn>,
    destroy: ReturnType<typeof vi.fn>,
    get: () => () => boolean
  }>
}));

vi.mock('@helpers/schedulers', () => ({
  fastRaf: (callback: () => void) => mocks.fastRafCallbacks.push(callback)
}));

vi.mock('@helpers/dom/positionElementByIndex', () => ({default: () => {}}));

vi.mock('@helpers/middleware', () => ({
  getMiddleware: () => {
    let generation = 0;
    const helper = {
      clean: vi.fn(() => ++generation),
      destroy: vi.fn(() => ++generation),
      get: () => {
        const current = generation;
        return () => current === generation;
      }
    };
    mocks.middlewareHelpers.push(helper);
    return helper;
  }
}));

vi.mock('@lib/appDialogsManager', () => ({
  default: {
    createChatList: () => document.createElement('ul'),
    addDialogNew: ({peerId}: {peerId: PeerId}) => {
      const listEl = document.createElement('li');
      listEl.dataset.peerId = String(peerId);
      const lastMessageSpan = document.createElement('span');
      listEl.append(lastMessageSpan);
      mocks.rows.push(listEl);
      return {dom: {listEl, lastMessageSpan}};
    }
  }
}));

vi.mock('@components/groupCall', () => ({
  getGroupCallParticipantMutedState: () => 0
}));

vi.mock('@components/groupCall/participantMutedIcon', () => ({
  default: class GroupCallParticipantMutedIconMock {
    public container = document.createElement('span');
    public destroy = vi.fn();
    public setState = vi.fn();

    constructor() {
      mocks.icons.push(this);
    }
  }
}));

vi.mock('@components/groupCall/participantStatus', () => ({
  default: class GroupCallParticipantStatusElementMock {
    public container = document.createElement('span');
    public setState = vi.fn();

    constructor() {
      mocks.statuses.push(this);
    }
  }
}));

import GroupCallParticipantsList from '@components/groupCall/participantsList';

const participant = {
  _: 'groupCallParticipant',
  date: 1,
  peer: {_: 'peerUser', user_id: 1},
  pFlags: {},
  source: 1
} as any;

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  mocks.fastRafCallbacks.length = 0;
  mocks.icons.length = 0;
  mocks.statuses.length = 0;
  mocks.middlewareHelpers.length = 0;
  mocks.rows.length = 0;
  vi.restoreAllMocks();
});

describe('group call participant row lifecycle', () => {
  it('destroys a row deleted while its fastRaf cleanup is still pending', async() => {
    const instance = {
      getParticipantByPeerId: vi.fn().mockResolvedValue(participant),
      isMemberWithAccess: vi.fn().mockReturnValue(false)
    };
    const list = new GroupCallParticipantsList(instance as any);
    await list.add(1 as PeerId);
    const icon = mocks.icons[0];
    const rowMiddleware = mocks.middlewareHelpers[mocks.middlewareHelpers.length - 1];

    expect(list.delete(1 as PeerId)).toBe(true);
    expect(mocks.fastRafCallbacks).toHaveLength(1);
    list.destroy();
    mocks.fastRafCallbacks[0]();
    list.destroy();

    expect(icon.destroy).toHaveBeenCalledTimes(1);
    expect(rowMiddleware.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not mutate a destroyed row after its async update resolves', async() => {
    let resolveUpdate: (value: typeof participant) => void;
    const pendingUpdate = new Promise<typeof participant>((resolve) => {
      resolveUpdate = resolve;
    });
    const instance = {
      getParticipantByPeerId: vi.fn()
      .mockResolvedValueOnce(participant)
      .mockReturnValueOnce(pendingUpdate),
      isMemberWithAccess: vi.fn().mockReturnValue(false)
    };
    const list = new GroupCallParticipantsList(instance as any);
    await list.add(1 as PeerId);
    const icon = mocks.icons[0];
    const status = mocks.statuses[0];

    list.destroy();
    resolveUpdate(participant);
    await flushPromises();

    expect(icon.setState).not.toHaveBeenCalled();
    expect(status.setState).not.toHaveBeenCalled();
  });

  it('handles an async update rejection without an unhandled promise', async() => {
    const error = new Error('participant lookup failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const instance = {
      getParticipantByPeerId: vi.fn()
      .mockResolvedValueOnce(participant)
      .mockRejectedValueOnce(error),
      isMemberWithAccess: vi.fn().mockReturnValue(false)
    };
    const list = new GroupCallParticipantsList(instance as any);

    await list.add(1 as PeerId);
    await flushPromises();

    expect(consoleError).toHaveBeenCalledWith('group call participant row update failed', error);
    list.destroy();
  });
});
