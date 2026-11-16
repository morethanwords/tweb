/*
 * A link to a comment (`t.me/<channel>/<post>?comment=<id>`) opens the post's comments in its discussion group at that
 * comment, as tdesktop's SessionNavigation::showRepliesForMessage does: the root is the first message the server
 * returns for the post, whether or not it carries its replies, and a post whose comments cannot be opened says why.
 * A comment wins over a thread named in the same link.
 */

import '@/tests/mocks/chatInputIntegrationUi';

const mocks = vi.hoisted(() => ({
  toastNew: vi.fn()
}));

vi.mock('@components/toast', async(importOriginal) => ({
  ...await importOriginal<typeof import('@components/toast')>(),
  toastNew: mocks.toastNew
}));

import {AppImManager} from '@lib/appImManager';
import '@helpers/peerIdPolyfill';

const CHANNEL_ID = 1006503122 as ChatId;
const CHANNEL_PEER_ID = CHANNEL_ID.toPeerId(true);
const GROUP_PEER_ID = (1000000001 as ChatId).toPeerId(true);
const channel = {_: 'channel', id: CHANNEL_ID, pFlags: {broadcast: true}} as any;

const prototype = AppImManager.prototype as any;

function makeHost(getDiscussionMessage: (peerId: PeerId, mid: number) => Promise<any>) {
  const host = {
    managers: {
      appMessagesIdsManager: {generateMessageId: (id: number) => id},
      appMessagesManager: {getDiscussionMessage: vi.fn(getDiscussionMessage)}
    },
    chat: {peerId: 0 as PeerId},
    openComment: prototype.openComment,
    openThread: vi.fn(),
    setInnerPeer: vi.fn()
  };

  return host;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('a comment link', () => {
  test('opens the thread of the root the server gives, at the comment', async() => {
    const host = makeHost(async() => ({peerId: GROUP_PEER_ID, mid: 472}));
    await prototype.op.call(host, {peer: channel, lastMsgId: 153, commentId: 475});

    expect(host.managers.appMessagesManager.getDiscussionMessage).toHaveBeenCalledWith(CHANNEL_PEER_ID, 153);
    expect(host.openThread).toHaveBeenCalledWith(expect.objectContaining({peerId: GROUP_PEER_ID, threadId: 472, lastMsgId: 475}));
    expect(mocks.toastNew).not.toHaveBeenCalled();
  });

  test('takes the comment over a thread named with it', async() => {
    const host = makeHost(async() => ({peerId: GROUP_PEER_ID, mid: 472}));
    await prototype.op.call(host, {peer: channel, lastMsgId: 153, commentId: 475, threadId: 5});

    expect(host.openThread).toHaveBeenCalledTimes(1);
    expect(host.openThread).toHaveBeenCalledWith(expect.objectContaining({peerId: GROUP_PEER_ID, threadId: 472, lastMsgId: 475}));
  });

  test.each([
    ['the post is not there', {type: 'MSG_ID_INVALID'}, 'MessageNotFound'],
    ['the group cannot be reached', {type: 'CHANNEL_PRIVATE'}, 'Community.GroupNotAccessible'],
    ['the user is banned in the group', {type: 'USER_BANNED_IN_CHANNEL'}, 'Community.GroupNotAccessible']
  ])('says so when %s', async(_, error, langPackKey) => {
    const host = makeHost(async() => {
      throw error;
    });
    await prototype.op.call(host, {peer: channel, lastMsgId: 153, commentId: 799032});

    expect(host.openThread).not.toHaveBeenCalled();
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey});
  });

  test('says the message is not there when the post has no discussion', async() => {
    const host = makeHost(async(): Promise<undefined> => undefined);
    await prototype.op.call(host, {peer: channel, lastMsgId: 153, commentId: 799032});

    expect(host.openThread).not.toHaveBeenCalled();
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'MessageNotFound'});
  });
});
