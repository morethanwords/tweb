import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {Message} from '@layer';

// A chat's history flushed (cleared, deleted, reloaded) while a message is being sent takes the temporary
// copy along. When the sent message comes, its send is finished all the same: nothing throws — which would cut
// short the arrival of the message itself — and no bubble is told to become it.

const peerId = (42 as UserId).toPeerId(false);

function setup() {
  const manager = new AppMessagesManager();
  const storage = (manager as any).createMessageStorage(peerId, 'history');
  const dispatchEvent = vi.fn();
  Object.assign(manager as any, {
    rootScope: {dispatchEvent},
    messagesStorageByPeerId: {},
    pendingByRandomId: {'7': {peerId, tempId: 1.0001, storage}},
    tempFinalizeCallbacks: {},
    mediaTempMap: {}
  });
  vi.spyOn(manager, 'getHistoryStorage').mockReturnValue({history: {delete: vi.fn()}} as any);
  vi.spyOn(manager, 'deleteMessageFromStorage').mockImplementation(() => true);
  const handleReleasingMessage = vi.spyOn(manager as any, 'handleReleasingMessage').mockImplementation(() => {});

  const sent = {
    _: 'message',
    id: 2,
    mid: 2,
    peerId,
    pFlags: {out: true},
    date: 0,
    message: 'sent',
    reply_markup: {_: 'replyKeyboardHide', pFlags: {}}
  } as Message.message;

  return {manager, dispatchEvent, handleReleasingMessage, sent};
}

describe('a message sent while its chat\'s history was flushed', () => {
  test('is finished without its temporary copy', () => {
    const {manager, dispatchEvent, handleReleasingMessage, sent} = setup();

    expect(() => manager.finalizePendingMessage('7', sent)).not.toThrow();

    expect((manager as any).pendingByRandomId['7']).toBeUndefined();
    expect(handleReleasingMessage).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalledWith('message_sent', expect.anything());
  });

  test('a widget\'s: what its widget kept under the temporary id goes under the server\'s all the same', () => {
    const {manager, dispatchEvent, sent} = setup();
    const onWidgetMessageSent = vi.fn();
    (manager as any).appWidgetsManager = {onWidgetMessageSent};
    sent.media = {_: 'messageMediaWidget', pFlags: {}} as any;

    manager.finalizePendingMessage('7', sent);

    expect(onWidgetMessageSent).toHaveBeenCalledWith(peerId, 1.0001, 2);
    expect(dispatchEvent).not.toHaveBeenCalledWith('message_sent', expect.anything());
  });
});
