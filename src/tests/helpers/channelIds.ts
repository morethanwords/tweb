import '@helpers/peerIdPolyfill';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';

/** A channel's ids as the messages manager sees them: its chat id and peer id, a fresh ids manager and `mid(id)` for the channel's server ids */
export function makeChannelIds(channelId = 77 as ChatId) {
  const peerId = channelId.toPeerId(true);
  const idsManager = new AppMessagesIdsManager();
  const mid = (id: number) => idsManager.generateMessageId(id, channelId);

  return {channelId, peerId, idsManager, mid};
}
