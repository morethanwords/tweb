/*
 * A video chat or a live stream a link points at (tdesktop SessionNavigation::joinVoiceChatFromLink →
 * Calls::Instance::startOrJoinGroupCall with JoinConfirm::Always): only the call running in the chat - the one
 * the link names, when it names one - is joined, only once the user said so, and a link never starts a call.
 * The call the user is in already is only shown (activateCurrentCall); from another call, the one question is
 * whether to leave it (confirmLeaveCurrent).
 */

import '@/tests/mocks/chatInputIntegrationUi';

const mocks = vi.hoisted(() => ({
  chooseGroupCallJoinAs: vi.fn(),
  confirmGroupCallJoin: vi.fn(),
  confirmationPopup: vi.fn(),
  showCallAccount: vi.fn(async(_accountNumber: number) => {}),
  showOngoingCall: vi.fn(),
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
vi.mock('@components/confirmationPopup', () => ({default: mocks.confirmationPopup}));
vi.mock('@components/wrappers/peerTitle', () => ({default: vi.fn(async() => document.createElement('span'))}));
vi.mock('@components/toast', async(importOriginal) => ({
  ...await importOriginal<typeof import('@components/toast')>(),
  toastNew: mocks.toastNew
}));
vi.mock('@lib/calls/callAccount', async(importOriginal) => ({
  ...await importOriginal<typeof import('@lib/calls/callAccount')>(),
  showCallAccount: mocks.showCallAccount
}));
vi.mock('@components/topbarCall', async(importOriginal) => ({
  ...await importOriginal<typeof import('@components/topbarCall')>(),
  showOngoingCall: mocks.showOngoingCall
}));

import {AppImManager} from '@lib/appImManager';
import groupCallsController from '@lib/calls/groupCallsController';
import rtmpCallsController from '@lib/calls/rtmpCallsController';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import '@helpers/peerIdPolyfill';

const CHAT_ID = 77 as ChatId;
const PEER_ID = CHAT_ID.toPeerId(true);
const ME = (1000).toPeerId();
const CALL = {_: 'groupCall', id: '123', access_hash: '456', pFlags: {}, title: 'Weekly sync'};
const STREAM = {...CALL, pFlags: {rtmp_stream: true}};

const prototype = AppImManager.prototype as any;

function makeHost(call: any) {
  const getRunningGroupCall = vi.fn(async(chatId: ChatId, id?: string) => {
    return call && (id === undefined || id === call.id) ? call : undefined;
  });
  const managers = {
    appGroupCallsManager: {getRunningGroupCall, createGroupCall: vi.fn()}
  };
  const steps: string[] = [];
  const host = {
    managers,
    callTransitions: {run: (callback: () => Promise<void>) => callback()},
    // * the app's own: whether to leave the call the user is in is asked of them, through the popup mocked here
    confirmLeavingCurrentCall: prototype.confirmLeavingCurrentCall,
    confirmLeavingGroupCall: prototype.confirmLeavingGroupCall,
    confirmLeavingCall: prototype.confirmLeavingCall,
    confirmLeavingLive: prototype.confirmLeavingLive,
    discardAnyCallConfirmation: prototype.discardAnyCallConfirmation,
    watchLiveStream: vi.fn(async(peerId: PeerId, account: object, callId?: string) => {
      steps.push('watch');
    }),
    log: Object.assign(() => {}, {warn: vi.fn(), error: vi.fn()})
  };

  return {host, managers, getRunningGroupCall, steps};
}

function joinCallFromLink(host: object, groupCallId?: string, inviteHash?: string) {
  return AppImManager.prototype.joinCallFromLink.call(host, PEER_ID, groupCallId, inviteHash) as Promise<void>;
}

/** The user in a video chat: another chat's, unless told which; leaving it is a step of `steps`. */
function inVideoChat(options: {chatId?: ChatId, id?: string, accountNumber?: number, steps?: string[]} = {}) {
  const instance = {
    chatId: options.chatId ?? (88 as ChatId),
    id: options.id ?? '555',
    accountNumber: options.accountNumber ?? getCurrentAccount(),
    hangUp: vi.fn(async() => {
      options.steps?.push('leave');
    })
  };
  vi.spyOn(groupCallsController, 'groupCall', 'get').mockReturnValue(instance as any);
  vi.spyOn(groupCallsController, 'isCurrentGroupCall').mockImplementation((call) => call === (instance as any));
  return instance;
}

let joinGroupCall: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  joinGroupCall = vi.spyOn(groupCallsController, 'joinGroupCall').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a video chat a link points at', () => {
  test('is joined once the user said so, the question naming the call by its title', async() => {
    const {host, managers, getRunningGroupCall} = makeHost(CALL);
    mocks.chooseGroupCallJoinAs.mockResolvedValue(ME);

    await joinCallFromLink(host, '123');

    expect(getRunningGroupCall).toHaveBeenCalledWith(CHAT_ID, '123');
    expect(mocks.chooseGroupCallJoinAs.mock.calls[0][0]).toMatchObject({
      peerId: PEER_ID,
      hasCall: true,
      confirm: true,
      callTitle: 'Weekly sync'
    });
    expect(mocks.confirmationPopup).not.toHaveBeenCalled();
    expect(joinGroupCall).toHaveBeenCalledTimes(1);
    expect(joinGroupCall.mock.calls[0].slice(0, 2)).toEqual([CHAT_ID, '123']);
    expect(joinGroupCall.mock.calls[0][6]).toBe(ME);
    expect(joinGroupCall.mock.calls[0][7]).toBeUndefined();
    expect(managers.appGroupCallsManager.createGroupCall).not.toHaveBeenCalled();
  });

  test('is joined with the speaker invite of the link', async() => {
    const {host} = makeHost(CALL);
    mocks.chooseGroupCallJoinAs.mockResolvedValue(ME);

    await joinCallFromLink(host, undefined, 'speaker');

    expect(joinGroupCall.mock.calls[0][7]).toBe('speaker');
  });

  test('is left alone when the question is declined', async() => {
    const {host} = makeHost(CALL);
    mocks.chooseGroupCallJoinAs.mockResolvedValue(undefined);

    await joinCallFromLink(host, '123');

    expect(joinGroupCall).not.toHaveBeenCalled();
  });

  test.each([
    ['the chat has no call running', null, '123'],
    ['the chat runs another call than the link names', CALL, '999'],
    ['the link names a chat that cannot be had', 'error', '123']
  ])('is neither joined nor started when %s: the link is invalid or has expired', async(_, call, id) => {
    const {host, managers, getRunningGroupCall} = makeHost(call === 'error' ? undefined : call);
    if(call === 'error') getRunningGroupCall.mockRejectedValue({type: 'CHANNEL_PRIVATE'});

    await joinCallFromLink(host, id);

    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'VoiceChat.LinkInvalid'});
    expect(mocks.chooseGroupCallJoinAs).not.toHaveBeenCalled();
    expect(mocks.confirmGroupCallJoin).not.toHaveBeenCalled();
    expect(mocks.confirmationPopup).not.toHaveBeenCalled();
    expect(joinGroupCall).not.toHaveBeenCalled();
    expect(managers.appGroupCallsManager.createGroupCall).not.toHaveBeenCalled();
  });

  test('that the user is in already is shown, with nothing asked and nothing joined again', async() => {
    const {host} = makeHost(CALL);
    const current = inVideoChat({chatId: CHAT_ID, id: '123'});
    const rejoinWithInviteHash = vi.spyOn(groupCallsController, 'rejoinWithInviteHash').mockResolvedValue(undefined);

    await joinCallFromLink(host, undefined, 'speaker');

    expect(mocks.showOngoingCall).toHaveBeenCalledWith(current);
    // * its speaker invite: used if an admin keeps the user muted there
    expect(rejoinWithInviteHash).toHaveBeenCalledWith(current, 'speaker');
    expect(mocks.chooseGroupCallJoinAs).not.toHaveBeenCalled();
    expect(mocks.confirmationPopup).not.toHaveBeenCalled();
    expect(current.hangUp).not.toHaveBeenCalled();
    expect(joinGroupCall).not.toHaveBeenCalled();
  });

  test('of the chat the user is in on another account is no call of theirs to show', async() => {
    const {host} = makeHost(CALL);
    inVideoChat({chatId: CHAT_ID, id: '123', accountNumber: getCurrentAccount() + 1});
    mocks.confirmationPopup.mockRejectedValue(undefined);

    await joinCallFromLink(host);

    expect(mocks.showOngoingCall).not.toHaveBeenCalled();
    expect(mocks.confirmationPopup).toHaveBeenCalledTimes(1);
  });

  test('from another call: only whether to leave it is asked, and it is left once who to be is chosen', async() => {
    const {host} = makeHost(CALL);
    const steps: string[] = [];
    inVideoChat({steps});
    mocks.showCallAccount.mockImplementation(async(accountNumber) => {
      steps.push('account ' + accountNumber);
    });
    mocks.confirmationPopup.mockImplementation(async() => {
      steps.push('asked to leave');
    });
    mocks.chooseGroupCallJoinAs.mockImplementation(async() => {
      steps.push('join as');
      return ME;
    });
    joinGroupCall.mockImplementation(async() => {
      steps.push('join');
    });

    await joinCallFromLink(host, '123');

    expect(mocks.confirmationPopup.mock.calls[0][0].descriptionLangKey).toBe('Call.Confirm.Discard.Voice.ToVoice.Text');
    // * no "join the video chat?" after the yes to leaving
    expect(mocks.chooseGroupCallJoinAs.mock.calls[0][0]).toMatchObject({confirm: false});
    // * the question is the joining account's: the tab went back to it first
    expect(steps).toEqual(['account ' + getCurrentAccount(), 'asked to leave', 'join as', 'leave', 'join']);
  });

  test('from another call: declining to leave it asks nothing more, and so does declining who to be', async() => {
    const {host} = makeHost(CALL);
    const current = inVideoChat();
    mocks.confirmationPopup.mockRejectedValueOnce(undefined);

    await joinCallFromLink(host, '123');

    expect(mocks.chooseGroupCallJoinAs).not.toHaveBeenCalled();

    // * the call the user is in is left only for the one they join
    mocks.confirmationPopup.mockResolvedValueOnce(undefined);
    mocks.chooseGroupCallJoinAs.mockResolvedValue(undefined);

    await joinCallFromLink(host, '123');

    expect(mocks.chooseGroupCallJoinAs).toHaveBeenCalledTimes(1);
    expect(current.hangUp).not.toHaveBeenCalled();
    expect(joinGroupCall).not.toHaveBeenCalled();
  });
});

describe('a live stream a link points at', () => {
  test('is watched once the user said so, whatever the link called it, the question naming it by its title', async() => {
    const {host} = makeHost(STREAM);
    mocks.confirmGroupCallJoin.mockResolvedValue(true);

    await joinCallFromLink(host);

    expect(mocks.confirmGroupCallJoin.mock.calls[0].slice(1)).toEqual([PEER_ID, 'Weekly sync']);
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

    expect(host.watchLiveStream).not.toHaveBeenCalled();
  });

  test('from another call: only whether to leave it is asked, then it is left and the stream watched', async() => {
    const {host, steps} = makeHost(STREAM);
    inVideoChat({steps});
    mocks.confirmationPopup.mockResolvedValue(undefined);

    await joinCallFromLink(host);

    expect(mocks.confirmationPopup.mock.calls[0][0].descriptionLangKey).toBe('Call.Confirm.Discard.Voice.ToLive.Text');
    expect(mocks.confirmGroupCallJoin).not.toHaveBeenCalled();
    expect(steps).toEqual(['leave', 'watch']);
  });

  test('that the user watches already is shown, with nothing asked', async() => {
    const {host} = makeHost(STREAM);
    const current = {chatId: CHAT_ID, call: {id: '123'}, accountNumber: getCurrentAccount()};
    vi.spyOn(rtmpCallsController, 'currentCall', 'get').mockReturnValue(current as any);

    await joinCallFromLink(host);

    expect(mocks.showOngoingCall).toHaveBeenCalledWith(current);
    expect(mocks.confirmGroupCallJoin).not.toHaveBeenCalled();
    expect(mocks.confirmationPopup).not.toHaveBeenCalled();
    expect(host.watchLiveStream).not.toHaveBeenCalled();
  });
});
