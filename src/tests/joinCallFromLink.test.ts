/*
 * A video chat or a live stream a link points at (tdesktop SessionNavigation::joinVoiceChatFromLink):
 * only the call running in the chat - the one the link names, when it names one - is joined, only once
 * the user said so, and a link never starts a call.
 */

import '@/tests/mocks/chatInputIntegrationUi';

const mocks = vi.hoisted(() => ({
  chooseGroupCallJoinAs: vi.fn(),
  confirmGroupCallJoin: vi.fn(),
  toastNew: vi.fn()
}));

vi.mock('@environment/groupCallSupport', () => ({default: true}));
vi.mock('@lib/calls/noiseSuppression/noiseSuppression', async(importOriginal) => ({
  ...await importOriginal<typeof import('@lib/calls/noiseSuppression/noiseSuppression')>(),
  preloadNoiseSuppression: vi.fn()
}));
vi.mock('@components/groupCall/joinAs', () => ({
  chooseGroupCallJoinAs: mocks.chooseGroupCallJoinAs,
  confirmGroupCallJoin: mocks.confirmGroupCallJoin
}));
vi.mock('@components/toast', async(importOriginal) => ({
  ...await importOriginal<typeof import('@components/toast')>(),
  toastNew: mocks.toastNew
}));

import {AppImManager} from '@lib/appImManager';
import groupCallsController from '@lib/calls/groupCallsController';
import '@helpers/peerIdPolyfill';

const CHAT_ID = 77 as ChatId;
const PEER_ID = CHAT_ID.toPeerId(true);
const ME = (1000).toPeerId();
const CALL = {_: 'groupCall', id: '123', access_hash: '456', pFlags: {}};

function makeHost(call: any) {
  const getRunningGroupCall = vi.fn(async(chatId: ChatId, id?: string) => {
    return call && (id === undefined || id === call.id) ? call : undefined;
  });
  const managers = {
    appGroupCallsManager: {getRunningGroupCall, createGroupCall: vi.fn()}
  };
  const host = {
    managers,
    callTransitions: {run: (callback: () => Promise<void>) => callback()},
    discardCurrentCall: vi.fn(async() => {}),
    chooseJoinAsAndLeaveCurrentCall: (AppImManager.prototype as any).chooseJoinAsAndLeaveCurrentCall,
    watchLiveStream: vi.fn(async(peerId: PeerId, account: object, callId?: string) => {}),
    log: Object.assign(() => {}, {warn: vi.fn(), error: vi.fn()})
  };

  return {host, managers, getRunningGroupCall};
}

function joinCallFromLink(host: object, groupCallId?: string) {
  return AppImManager.prototype.joinCallFromLink.call(host, PEER_ID, groupCallId) as Promise<void>;
}

let joinGroupCall: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  joinGroupCall = vi.spyOn(groupCallsController, 'joinGroupCall').mockResolvedValue(undefined);
});

afterEach(() => {
  joinGroupCall.mockRestore();
});

describe('a video chat a link points at', () => {
  test('is joined once the user said so', async() => {
    const {host, managers, getRunningGroupCall} = makeHost(CALL);
    mocks.chooseGroupCallJoinAs.mockResolvedValue(ME);

    await joinCallFromLink(host, '123');

    expect(getRunningGroupCall).toHaveBeenCalledWith(CHAT_ID, '123');
    expect(mocks.chooseGroupCallJoinAs.mock.calls[0][0]).toMatchObject({peerId: PEER_ID, hasCall: true, confirm: true});
    expect(host.discardCurrentCall).toHaveBeenCalledWith(PEER_ID, 'Voice');
    expect(joinGroupCall).toHaveBeenCalledTimes(1);
    expect(joinGroupCall.mock.calls[0].slice(0, 2)).toEqual([CHAT_ID, '123']);
    expect(joinGroupCall.mock.calls[0][6]).toBe(ME);
    expect(managers.appGroupCallsManager.createGroupCall).not.toHaveBeenCalled();
  });

  test('is left alone, and so is the call the user is in, when the question is declined', async() => {
    const {host} = makeHost(CALL);
    mocks.chooseGroupCallJoinAs.mockResolvedValue(undefined);

    await joinCallFromLink(host, '123');

    expect(host.discardCurrentCall).not.toHaveBeenCalled();
    expect(joinGroupCall).not.toHaveBeenCalled();
  });

  test.each([
    ['the chat has no call running', null, '123'],
    ['the chat runs another call than the link names', CALL, '999'],
    ['the link names a chat that cannot be had', 'error', '123']
  ])('is neither joined nor started when %s', async(_, call, id) => {
    const {host, managers, getRunningGroupCall} = makeHost(call === 'error' ? undefined : call);
    if(call === 'error') getRunningGroupCall.mockRejectedValue({type: 'CHANNEL_PRIVATE'});

    await joinCallFromLink(host, id);

    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'VoiceChat.Chat.Ended'});
    expect(mocks.chooseGroupCallJoinAs).not.toHaveBeenCalled();
    expect(mocks.confirmGroupCallJoin).not.toHaveBeenCalled();
    expect(host.discardCurrentCall).not.toHaveBeenCalled();
    expect(joinGroupCall).not.toHaveBeenCalled();
    expect(managers.appGroupCallsManager.createGroupCall).not.toHaveBeenCalled();
  });
});

describe('a live stream a link points at', () => {
  const STREAM = {...CALL, pFlags: {rtmp_stream: true}};

  test('is watched once the user said so, whatever the link called it', async() => {
    const {host} = makeHost(STREAM);
    mocks.confirmGroupCallJoin.mockResolvedValue(true);

    await joinCallFromLink(host);

    expect(mocks.confirmGroupCallJoin.mock.calls[0][1]).toBe(PEER_ID);
    expect(host.discardCurrentCall).toHaveBeenCalledWith(PEER_ID, 'Live');
    expect(host.watchLiveStream).toHaveBeenCalledTimes(1);
    // * that very stream: not another the chat may have started while the question was open
    expect(host.watchLiveStream.mock.calls[0][0]).toBe(PEER_ID);
    expect(host.watchLiveStream.mock.calls[0][2]).toBe('123');
    expect(mocks.chooseGroupCallJoinAs).not.toHaveBeenCalled();
    expect(joinGroupCall).not.toHaveBeenCalled();
  });

  test('is not watched when the question is declined', async() => {
    const {host} = makeHost(STREAM);
    mocks.confirmGroupCallJoin.mockResolvedValue(false);

    await joinCallFromLink(host);

    expect(host.discardCurrentCall).not.toHaveBeenCalled();
    expect(host.watchLiveStream).not.toHaveBeenCalled();
  });
});
