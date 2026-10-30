import {Message, MessageReactions, Update} from '@layer';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import SlicedArray, {SliceEnd} from '@helpers/slicedArray';
import '@helpers/peerIdPolyfill';

const selfId = 1 as PeerId;
const peerId = 2 as PeerId;
const mid = 10;

function makeReactions(unread: boolean): MessageReactions {
  return {
    _: 'messageReactions',
    pFlags: {can_see_list: true},
    results: [{_: 'reactionCount', count: 1, reaction: {_: 'reactionEmoji', emoticon: '👍'}}],
    recent_reactions: [{
      _: 'messagePeerReaction',
      pFlags: unread ? {unread: true} : {},
      peer_id: {_: 'peerUser', user_id: peerId.toUserId()},
      date: 1,
      reaction: {_: 'reactionEmoji', emoticon: '👍'}
    }]
  };
}

function makeHarness(unreadReactionsCount: number) {
  const manager = new AppMessagesManager() as any;
  const message = {
    _: 'message',
    pFlags: {out: true},
    id: mid,
    mid,
    peerId,
    peer_id: {_: 'peerUser', user_id: peerId.toUserId()},
    date: 1,
    message: 'hello',
    reactions: makeReactions(true)
  } as any as Message.message;
  const dialog = {
    _: 'dialog',
    pFlags: {},
    peer: {_: 'peerUser', user_id: peerId.toUserId()},
    peerId,
    top_message: mid,
    unread_count: 0,
    unread_mentions_count: 0,
    unread_reactions_count: unreadReactionsCount
  } as any;
  const events: Array<[string, any]> = [];
  const invokeApi = vi.fn((method: string, _params?: any): Promise<any> => {
    if(method === 'messages.readReactions') {
      return Promise.resolve({_: 'messages.affectedHistory', pts: 2, pts_count: 1, offset: 0});
    }

    return Promise.reject(new Error('unexpected ' + method));
  });

  Object.assign(manager, {
    unreadMentions: {},
    appMessagesIdsManager: {generateMessageId: (id: number) => id},
    appPeersManager: {
      peerId: selfId,
      getPeerId: (peer: any) => peer?.user_id?.toPeerId?.(false) ?? peerId,
      getInputPeerById: () => ({_: 'inputPeerUser', user_id: peerId.toUserId(), access_hash: '0'}),
      isForum: () => false,
      isBotforum: () => false
    },
    getMonoforumThreadId: (): undefined => undefined,
    getMessageByPeer: () => message,
    pushBatchUpdate: vi.fn(),
    modifyMessage: (message: any, callback: (message: any) => void) => {
      callback(message);
      return message;
    },
    getNotifyPeerSettings: () => Promise.resolve({muted: false, peerTypeNotifySettings: {show_previews: false}}),
    dialogsStorage: {
      getAnyDialog: () => dialog,
      prepareDialogUnreadCountModifying: () => () => {},
      setDialogToState: vi.fn()
    },
    rootScope: {dispatchEvent: (name: string, payload: any) => events.push([name, payload])},
    apiManager: {invokeApi},
    apiUpdatesManager: {processLocalUpdate: vi.fn()}
  });

  const update = (reactions: MessageReactions): Update.updateMessageReactions => ({
    _: 'updateMessageReactions',
    peer: {_: 'peerUser', user_id: peerId.toUserId()},
    msg_id: mid,
    reactions
  });

  return {manager, message, dialog, events, invokeApi, update};
}

describe('unread reactions counter', () => {
  test('a reaction taken off before it was seen takes the badge with it', () => {
    const {manager, dialog, update} = makeHarness(1);
    // * the last reaction gone: the server sends the message's reactions without any recent ones
    manager.onUpdateMessageReactions(update({_: 'messageReactions', pFlags: {can_see_list: true}, results: []}));
    expect(dialog.unread_reactions_count).toBe(0);
  });

  test('a reaction taken off while another one stays unread leaves one on the badge', () => {
    const {manager, dialog, message, update} = makeHarness(2);
    const reactions = makeReactions(true);
    message.reactions.recent_reactions.push({...reactions.recent_reactions[0], date: 2});
    manager.onUpdateMessageReactions(update(reactions));
    expect(dialog.unread_reactions_count).toBe(2);
  });

  test('a min update, which leaves the recent reactions out, keeps the unread one on the badge', () => {
    const {manager, dialog, update} = makeHarness(1);
    const {results} = makeReactions(true);
    manager.onUpdateMessageReactions(update({_: 'messageReactions', pFlags: {min: true}, results}));
    expect(dialog.unread_reactions_count).toBe(1);
  });

  test('a min update with no reactions left takes the badge off', () => {
    const {manager, dialog, update} = makeHarness(1);
    manager.onUpdateMessageReactions(update({_: 'messageReactions', pFlags: {min: true}, results: []}));
    expect(dialog.unread_reactions_count).toBe(0);
  });

  test('a reaction read the usual way still comes off the badge', () => {
    const {manager, dialog, update} = makeHarness(1);
    manager.onUpdateMessageReactions(update(makeReactions(false)));
    expect(dialog.unread_reactions_count).toBe(0);
  });

  test('reading all reactions clears the badge and the cached list at once', async() => {
    const {manager, dialog, events} = makeHarness(3);
    const cached = new SlicedArray<number>();
    cached.insertSlice([30, 20, 10]);
    cached.first.setEnd(SliceEnd.Both);
    manager.unreadMentions[`${peerId}_reaction`] = cached;

    await manager.readMentions(peerId, undefined, true);

    expect(dialog.unread_reactions_count).toBe(0);
    expect(cached.length).toBe(0);
    expect(events.some(([name, payload]) => name === 'dialog_unread' && payload.dialog === dialog)).toBe(true);
  });
});
