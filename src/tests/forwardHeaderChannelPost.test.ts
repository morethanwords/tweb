import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import {MESSAGE_ID_OFFSET} from '@appManagers/constants';
import {Message, MessageFwdHeader, Peer} from '@layer';

const SELF_ID = (999 as UserId).toPeerId(false);
const CHANNEL_ID = 1234 as ChatId;
const CHANNEL_PEER_ID = CHANNEL_ID.toPeerId(true);
const OTHER_CHANNEL_ID = 4321 as ChatId;
const MEGAGROUP_ID = 8765 as ChatId;
const MEGAGROUP_PEER_ID = MEGAGROUP_ID.toPeerId(true);
const SIGNER_ID = 5678 as UserId;
const SIGNER_PEER_ID = SIGNER_ID.toPeerId(false);
const OTHER_PEER_ID = (123 as UserId).toPeerId(false);
const PRIVATE_FORWARD_NAME = 'Signer';
const POST_ID = 264;
const POST_DATE = 1700000000;
const SERVER_TIME_OFFSET = 37;

function makeManager() {
  const manager = new AppMessagesManager();

  Object.assign(manager as any, {
    appMessagesIdsManager: new AppMessagesIdsManager(),
    log: Object.assign(() => {}, {error: vi.fn()}),
    timeManager: {getServerTimeOffset: () => SERVER_TIME_OFFSET},
    appPeersManager: {
      peerId: SELF_ID,
      isBroadcast: (peerId: PeerId) => peerId === CHANNEL_PEER_ID,
      getOutputPeer: (peerId: PeerId): Peer => peerId.isUser() ?
        {_: 'peerUser', user_id: peerId.toUserId()} :
        {_: 'peerChannel', channel_id: peerId.toChatId()}
    },
    appProfileManager: {
      // * the full user is cached as soon as the signer's profile has been opened
      getCachedFullUser: (userId: UserId) => userId === SIGNER_ID ?
        {private_forward_name: PRIVATE_FORWARD_NAME} :
        undefined
    }
  });

  return manager;
}

function generateForwardHeader(toPeerId: PeerId, message: Message.message, isReply?: boolean) {
  return (makeManager() as any).generateForwardHeader(toPeerId, message, isReply) as MessageFwdHeader.messageFwdHeader;
}

function makeSignedChannelPost(overrides: Partial<Message.message> = {}): Message.message {
  return {
    _: 'message',
    pFlags: {post: true},
    id: POST_ID,
    mid: MESSAGE_ID_OFFSET + POST_ID,
    peerId: CHANNEL_PEER_ID,
    fromId: SIGNER_PEER_ID,
    from_id: {_: 'peerUser', user_id: SIGNER_ID},
    post_author: PRIVATE_FORWARD_NAME,
    date: POST_DATE,
    message: '',
    ...overrides
  } as any as Message.message;
}

describe('generateForwardHeader dates', () => {
  it('compensates the offset saveMessage will subtract from a forward header', () => {
    const fwdHeader = generateForwardHeader(OTHER_PEER_ID, makeSignedChannelPost());

    // * saveMessage subtracts the offset again, landing back on the source message's own date
    expect(fwdHeader.date).toBe(POST_DATE + SERVER_TIME_OFFSET);
  });

  it('copies the date as it is into a reply header', () => {
    // * a reply header is never normalized in saveMessage, so it must not be compensated
    const fwdHeader = generateForwardHeader(OTHER_PEER_ID, makeSignedChannelPost(), true);

    expect(fwdHeader.date).toBe(POST_DATE);
  });

  it('keeps saved_date in the same clock as date', () => {
    const message = makeSignedChannelPost({
      fwd_from: {_: 'messageFwdHeader', pFlags: {}, from_id: {_: 'peerUser', user_id: SIGNER_ID}, date: POST_DATE - 100}
    } as any);

    const fwdHeader = generateForwardHeader(SELF_ID, message);

    expect(fwdHeader.saved_date).toBe(fwdHeader.date);
  });
});

describe('generateForwardHeader', () => {
  it('attributes a signed channel post to the channel, not to the signer', () => {
    const fwdHeader = generateForwardHeader(OTHER_PEER_ID, makeSignedChannelPost());

    expect(fwdHeader.from_id).toEqual({_: 'peerChannel', channel_id: CHANNEL_ID});
    expect(fwdHeader.channel_post).toBe(POST_ID);
    expect(fwdHeader.post_author).toBe(PRIVATE_FORWARD_NAME);
    // * the signer's forward privacy must not hide a channel post
    expect(fwdHeader.from_name).toBeUndefined();
  });

  it('never leaves channel_post without from_id', () => {
    const fwdHeader = generateForwardHeader(SELF_ID, makeSignedChannelPost());

    expect(fwdHeader.channel_post).toBeTruthy();
    expect(fwdHeader.from_id).toBeTruthy();
    expect(fwdHeader.saved_from_peer).toEqual({_: 'peerChannel', channel_id: CHANNEL_ID});
    expect(fwdHeader.saved_from_msg_id).toBe(POST_ID);
  });

  it('keeps the author of an unsigned channel post', () => {
    const message = makeSignedChannelPost({
      from_id: undefined,
      fromId: CHANNEL_PEER_ID,
      post_author: undefined
    } as any);

    const fwdHeader = generateForwardHeader(OTHER_PEER_ID, message);

    expect(fwdHeader.from_id).toEqual({_: 'peerChannel', channel_id: CHANNEL_ID});
    expect(fwdHeader.channel_post).toBe(POST_ID);
  });

  it('keeps a channel author that is not the channel the post lives in', () => {
    const message = makeSignedChannelPost({
      from_id: {_: 'peerChannel', channel_id: OTHER_CHANNEL_ID},
      fromId: OTHER_CHANNEL_ID.toPeerId(true)
    } as any);

    const fwdHeader = generateForwardHeader(OTHER_PEER_ID, message);

    expect(fwdHeader.from_id).toEqual({_: 'peerChannel', channel_id: OTHER_CHANNEL_ID});
  });

  it('keeps the sender of a megagroup message', () => {
    const message = makeSignedChannelPost({
      pFlags: {},
      peerId: MEGAGROUP_PEER_ID,
      post_author: undefined
    } as any);

    const fwdHeader = generateForwardHeader(OTHER_PEER_ID, message);

    // * not a broadcast, so the signer's forward privacy applies as before
    expect(fwdHeader.from_id).toBeUndefined();
    expect(fwdHeader.from_name).toBe(PRIVATE_FORWARD_NAME);
    expect(fwdHeader.channel_post).toBeUndefined();
  });

  it('still hides a private message from a user with forward privacy', () => {
    const message = {
      _: 'message',
      pFlags: {},
      id: 5,
      mid: 5,
      peerId: SIGNER_PEER_ID,
      fromId: SIGNER_PEER_ID,
      from_id: {_: 'peerUser', user_id: SIGNER_ID},
      date: POST_DATE,
      message: 'hi'
    } as any as Message.message;

    const fwdHeader = generateForwardHeader(OTHER_PEER_ID, message);

    expect(fwdHeader.from_id).toBeUndefined();
    expect(fwdHeader.from_name).toBe(PRIVATE_FORWARD_NAME);
    expect(fwdHeader.channel_post).toBeUndefined();
  });
});

describe('normalizeForwardHeaderMessageIds', () => {
  function normalize(fwdHeader: Partial<MessageFwdHeader.messageFwdHeader>) {
    const manager = makeManager();
    (manager as any).normalizeForwardHeaderMessageIds(fwdHeader);
    return {fwdHeader: fwdHeader as MessageFwdHeader.messageFwdHeader, log: (manager as any).log};
  }

  it('namespaces channel_post by the channel it was posted in', () => {
    const {fwdHeader, log} = normalize({
      from_id: {_: 'peerChannel', channel_id: CHANNEL_ID},
      channel_post: POST_ID
    });

    expect(fwdHeader.channel_post).toBe(MESSAGE_ID_OFFSET + POST_ID);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('leaves saved_from_msg_id of a private chat alone', () => {
    const {fwdHeader, log} = normalize({
      saved_from_peer: {_: 'peerUser', user_id: SIGNER_ID},
      saved_from_msg_id: 7
    });

    expect(fwdHeader.saved_from_msg_id).toBe(7);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('does not throw on a header that carries channel_post without from_id', () => {
    // * the shape that used to abort a whole forward before it was ever sent
    const {fwdHeader, log} = normalize({
      from_name: PRIVATE_FORWARD_NAME,
      channel_post: POST_ID,
      saved_from_peer: {_: 'peerChannel', channel_id: CHANNEL_ID},
      saved_from_msg_id: POST_ID
    });

    expect(fwdHeader.channel_post).toBe(MESSAGE_ID_OFFSET + POST_ID);
    expect(fwdHeader.saved_from_msg_id).toBe(MESSAGE_ID_OFFSET + POST_ID);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('reports a channel_post that resolves to no channel at all', () => {
    const {fwdHeader, log} = normalize({
      from_id: {_: 'peerUser', user_id: SIGNER_ID},
      channel_post: POST_ID
    });

    expect(log.error).toHaveBeenCalled();
    expect(fwdHeader.channel_post).toBe(POST_ID);
  });
});
