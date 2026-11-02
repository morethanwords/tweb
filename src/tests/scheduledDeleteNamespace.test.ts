import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import {MESSAGE_ID_OFFSET} from '@appManagers/constants';
import {Message} from '@layer';

// Scheduled messages are numbered apart from the chat's history, and in a channel their ids fall on the
// mids of its own messages. A scheduled message deleted, or sent when its time comes, takes nothing of the
// history message with the same id along: that one is not marked deleted (replies to it would read
// "Deleted message", and it would never be asked for again), and no thread loses a reply for it.

const channelId = 77 as ChatId;
const peerId = channelId.toPeerId(true);
const mid = MESSAGE_ID_OFFSET + 5;

function setup() {
  const manager = new AppMessagesManager();
  const scheduled = (manager as any).createMessageStorage(peerId, 'scheduled');
  scheduled.set(mid, {
    _: 'message',
    id: 5,
    mid,
    peerId,
    pFlags: {out: true, is_scheduled: true},
    date: 0,
    message: 'later',
    reply_to: {_: 'messageReplyHeader', pFlags: {}, reply_to_msg_id: MESSAGE_ID_OFFSET + 2, reply_to_top_id: MESSAGE_ID_OFFSET + 2}
  } as Message.message);

  const dispatchEvent = vi.fn();
  Object.assign(manager as any, {
    rootScope: {dispatchEvent},
    scheduledMessagesStorage: {[peerId]: scheduled},
    deletedMessages: new Set(),
    missingMessages: new Set(),
    appMessagesIdsManager: new AppMessagesIdsManager(),
    appPeersManager: {getPeerId: () => peerId}
  });
  for(const method of ['invalidateRichMessage', 'handleReleasingMessage', 'getThreadKey']) {
    vi.spyOn(manager as any, method).mockImplementation(() => {});
  }
  const updateMessageRepliesIfNeeded = vi.spyOn(manager as any, 'updateMessageRepliesIfNeeded').mockImplementation(() => {});
  vi.spyOn(manager, 'getMessageFromStorage').mockImplementation((target: any, id: number) => target.get(id));
  vi.spyOn(manager, 'deleteMessageFromStorage').mockImplementation((target: any, id: number) => target.delete(id));

  return {manager, scheduled, dispatchEvent, updateMessageRepliesIfNeeded};
}

describe('a scheduled message deleted or sent', () => {
  test('takes nothing of the history message with the same id', () => {
    const {manager, scheduled, dispatchEvent, updateMessageRepliesIfNeeded} = setup();

    (manager as any).onUpdateDeleteScheduledMessages({
      _: 'updateDeleteScheduledMessages',
      peer: {_: 'peerChannel', channel_id: channelId},
      messages: [5]
    });

    expect(scheduled.has(mid)).toBe(false);
    expect(dispatchEvent).toHaveBeenCalledWith('scheduled_delete', {peerId, mids: [mid]});
    expect((manager as any).deletedMessages.has(`${peerId}_${mid}`)).toBe(false);
    expect(updateMessageRepliesIfNeeded).not.toHaveBeenCalled();
  });
});
