import {vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import deferredPromise from '@helpers/cancellablePromise';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {setEnvironment} from '@environment/utils';
import {Document, InputPeer, Message, Updates} from '@layer';

// An AppMessagesManager that only makes the document of a file to send (makeDocumentAndMetaForSendingFile): no
// image or video type is known, so no file is a photo or a video, and saveDoc keeps a document as given.
// `managers` stands in for whatever else the case reaches.
export function makeDocumentMakingManager(managers: Record<string, unknown> = {}) {
  setEnvironment({
    IMAGE_MIME_TYPES_SUPPORTED: new Set(),
    VIDEO_MIME_TYPES_SUPPORTED: new Set()
  } as any);
  const manager = new AppMessagesManager();
  Object.assign(manager as any, {
    appDocsManager: {saveDoc: (document: Document.document) => document},
    ...managers
  });
  return manager;
}

// An AppMessagesManager whose sending goes nowhere: what a send asks the server is in invokeApi and
// invokeApiAfter (both answer with empty updates), each message it makes is sent at once and kept in
// optimisticMessages, and the text limit is 4 characters, so that splitting is easy to reach.

export const peerId = (42 as UserId).toPeerId(false);
export const inputPeer: InputPeer.inputPeerUser = {
  _: 'inputPeerUser',
  user_id: 42,
  access_hash: '1'
};

export function makeUpdates(): Updates.updates {
  return {
    _: 'updates',
    updates: [],
    users: [],
    chats: [],
    date: 0,
    seq: 0
  };
}

export function makeMessagesManager() {
  const manager = new AppMessagesManager();
  const invokeApi = vi.fn().mockResolvedValue(makeUpdates());
  const invokeApiAfter = vi.fn().mockResolvedValue(makeUpdates());
  const optimisticMessages: Message.message[] = [];

  Object.assign(manager as any, {
    apiManager: {
      getAppConfig: vi.fn().mockResolvedValue({}),
      invokeApi,
      invokeApiAfter
    },
    apiUpdatesManager: {
      processLocalUpdate: vi.fn(),
      processPaidMessageUpdate: vi.fn(),
      processUpdateMessage: vi.fn()
    },
    appPeersManager: {
      getInputPeerById: () => inputPeer,
      getPeerMigratedTo: (): PeerId | undefined => undefined,
      isChannel: () => false,
      isAnyGroup: () => false
    },
    appUsersManager: {isBot: () => false},
    repayRequestHandler: {tryRegisterRequest: vi.fn()},
    appProfileManager: {isEphemeralBotCommand: vi.fn().mockReturnValue(false)},
    rootScope: {dispatchEvent: vi.fn(), premium: true}
  });

  vi.spyOn(manager, 'checkSendOptions').mockResolvedValue({
    config: {message_length_max: 4},
    appConfig: {emojies_send_dice: ['🎲']}
  } as any);
  vi.spyOn(manager, 'generateOutgoingMessage').mockImplementation(() => ({
    _: 'message',
    id: -1,
    mid: -1,
    peerId,
    pFlags: {},
    message: '',
    random_id: '1',
    promise: deferredPromise<void>()
  } as any));
  vi.spyOn(manager, 'beforeMessageSending').mockImplementation((message) => {
    optimisticMessages.push(message);
    void message.send();
    return undefined;
  });
  vi.spyOn(manager as any, 'onMessagesSendError').mockImplementation(() => {});

  return {invokeApi, invokeApiAfter, manager, optimisticMessages};
}
