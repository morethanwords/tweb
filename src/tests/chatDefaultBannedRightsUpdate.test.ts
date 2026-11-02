import {AppChatsManager} from '@appManagers/appChatsManager';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import type {Chat, ChatBannedRights, Update} from '@layer';
import '@helpers/peerIdPolyfill';

// A group's restrictions for its members (what they may send, whether they may set their own tag) come with
// updateChatDefaultBannedRights. The worker changed its chat, but not the tabs' copy of it - which they read
// synchronously, e.g. the members list deciding whether a tag opens its editor - nor the copy kept for the next start.

const CHAT_ID = 5 as ChatId;

function setup() {
  const mirror = vi.fn();
  vi.spyOn(MTProtoMessagePort, 'getInstance').mockReturnValue({invokeVoid: mirror} as any);

  const chat = {
    _: 'channel',
    id: CHAT_ID,
    pFlags: {megagroup: true},
    default_banned_rights: {_: 'chatBannedRights', pFlags: {}, until_date: 0}
  } as any as Chat.channel;
  const storage = {set: vi.fn()};
  const dispatchEvent = vi.fn();
  const manager = new AppChatsManager();
  Object.assign(manager as any, {
    chats: {[CHAT_ID]: chat},
    storage,
    peersStorage: {isPeerNeeded: () => true},
    appPeersManager: {getPeerId: () => CHAT_ID.toPeerId(true)},
    rootScope: {dispatchEvent}
  });

  return {manager, chat, mirror, storage, dispatchEvent};
}

describe('a group\'s restrictions changed', () => {
  test('reach the tabs\' copy of the group and the copy kept for the next start', () => {
    const {manager, chat, mirror, storage, dispatchEvent} = setup();
    const rights: ChatBannedRights = {_: 'chatBannedRights', pFlags: {edit_rank: true}, until_date: 0};

    (manager as any).onUpdateChatDefaultBannedRights({
      _: 'updateChatDefaultBannedRights',
      peer: {_: 'peerChannel', channel_id: CHAT_ID},
      default_banned_rights: rights,
      version: 1
    } as Update.updateChatDefaultBannedRights);

    expect(chat.default_banned_rights).toBe(rights);
    expect(mirror).toHaveBeenCalledWith('mirror', expect.objectContaining({
      name: 'peers',
      key: '' + CHAT_ID.toPeerId(true),
      value: expect.objectContaining({default_banned_rights: rights})
    }));
    expect(storage.set).toHaveBeenCalledWith({[CHAT_ID]: chat});
    expect(dispatchEvent).toHaveBeenCalledWith('chat_update', CHAT_ID);
  });
});
