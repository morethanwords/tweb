import '@helpers/peerIdPolyfill';
import {AppPollsManager} from '@appManagers/appPollsManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {Message, Peer} from '@layer';

// An own poll's "unread votes" mark comes with updateMessagePoll, which may name its message (peer + msg_id). The
// message is found by its client id: a channel's message id is made of the channel's, any other's is the server's
// own. A basic group's poll was looked up as a channel's — never found — so its chat's unread-votes badge neither
// came nor went.

const basicChatId = 20 as ChatId;
const channelId = 60 as ChatId;

function setup(messages: Message.message[]) {
  const manager = new AppPollsManager() as any;
  const modifyCachedMentionsAndSave = vi.fn();
  Object.assign(manager, {
    appMessagesIdsManager: new AppMessagesIdsManager(),
    appPeersManager: {
      getPeerId,
      isChannel: (peerId: PeerId) => peerId === channelId.toPeerId(true),
      isForum: () => false,
      isBotforum: () => false
    },
    appMessagesManager: {
      getMessageByPeer: (peerId: PeerId, mid: number) => messages.find((message) => message.peerId === peerId && message.mid === mid),
      modifyCachedMentionsAndSave
    }
  });

  return {manager, modifyCachedMentionsAndSave};
}

function ownPoll(peerId: PeerId, mid: number) {
  return {_: 'message', peerId, mid, pFlags: {out: true}} as Message.message;
}

describe('an own poll\'s unread votes, named by the update', () => {
  test('in a basic group reach its message', () => {
    const peerId = basicChatId.toPeerId(true);
    const {manager, modifyCachedMentionsAndSave} = setup([ownPoll(peerId, 5)]);
    const peer: Peer = {_: 'peerChat', chat_id: basicChatId};

    manager.bumpUnreadPollVotes({poll_id: '1', peer, msg_id: 5}, true);

    expect(modifyCachedMentionsAndSave).toHaveBeenCalledWith(expect.objectContaining({peerId, mid: 5, addPollVote: true}));
  });

  test('in a channel reach its message', () => {
    const peerId = channelId.toPeerId(true);
    const mid = new AppMessagesIdsManager().generateMessageId(7, channelId);
    const {manager, modifyCachedMentionsAndSave} = setup([ownPoll(peerId, mid)]);
    const peer: Peer = {_: 'peerChannel', channel_id: channelId};

    manager.bumpUnreadPollVotes({poll_id: '1', peer, msg_id: 7}, false);

    expect(modifyCachedMentionsAndSave).toHaveBeenCalledWith(expect.objectContaining({peerId, mid, addPollVote: false}));
  });
});
