import {AppProfileManager} from '@appManagers/appProfileManager';
import type {ChatFull, ChatParticipant, ChatParticipants, Update} from '@layer';
import canEditAdmin from '@appManagers/utils/chats/canEditAdmin';
import '@helpers/peerIdPolyfill';

// A basic group's member made an admin, or no longer one, comes with updateChatParticipantAdmin, which says nothing
// else. The cached member was rebuilt with this account as its inviter and now as its date - and that inviter is
// what the administrators list shows as the one who promoted, and what canEditAdmin lets edit the admin by.

const CHAT_ID = 5 as ChatId;
const MY_ID = 1 as UserId;
const MEMBER_ID = 10 as UserId;
const INVITER_ID = 20 as UserId;

function setup() {
  const participants: ChatParticipants.chatParticipants = {
    _: 'chatParticipants',
    chat_id: CHAT_ID,
    participants: [{_: 'chatParticipant', user_id: MEMBER_ID, inviter_id: INVITER_ID, date: 1000, rank: 'mentor'}],
    version: 3
  };
  const manager = new AppProfileManager();
  Object.assign(manager as any, {
    chatsFull: {[CHAT_ID]: {_: 'chatFull', id: CHAT_ID, participants} as ChatFull.chatFull},
    appUsersManager: {getSelf: () => ({id: MY_ID})},
    rootScope: {dispatchEvent: vi.fn(), myId: MY_ID.toPeerId(false)}
  });

  const promote = (is_admin: boolean, version: number) => (manager as any).onUpdateChatParticipantAdmin({
    _: 'updateChatParticipantAdmin',
    chat_id: CHAT_ID,
    user_id: MEMBER_ID,
    is_admin,
    version
  } as Update.updateChatParticipantAdmin);

  return {participants, promote};
}

describe('a basic group\'s member made an admin', () => {
  test('keeps who added them and when', () => {
    const {participants, promote} = setup();

    promote(true, 4);

    expect(participants.participants[0]).toEqual({
      _: 'chatParticipantAdmin',
      user_id: MEMBER_ID,
      inviter_id: INVITER_ID,
      date: 1000,
      rank: 'mentor'
    });
  });

  test('is not taken for one this account may edit', () => {
    const {participants, promote} = setup();

    promote(true, 4);

    const chat = {_: 'chat', id: CHAT_ID, pFlags: {}} as any;
    expect(canEditAdmin(chat, participants.participants[0] as ChatParticipant, MY_ID.toPeerId(false))).toBe(false);
  });

  test('and no longer one, too', () => {
    const {participants, promote} = setup();

    promote(true, 4);
    promote(false, 5);

    expect(participants.participants[0]).toMatchObject({_: 'chatParticipant', inviter_id: INVITER_ID, date: 1000});
  });
});
