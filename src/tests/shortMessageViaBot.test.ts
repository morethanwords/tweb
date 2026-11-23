import getPeerId from '@appManagers/utils/peers/getPeerId';
import createUpdatesManager from '@/tests/helpers/updatesManager';
import outputPeer from '@/tests/helpers/outputPeer';
import {Message, Update, Updates} from '@layer';

// A text message in a private chat or a basic group comes as updateShortMessage / updateShortChatMessage, which
// the client turns into a whole message. One sent via an inline bot names the bot in via_bot_id, and the message
// keeps it, as tdesktop's does: without it the bubble lost its "via @bot". As for any message naming a peer, a bot
// the client does not know yet is waited for with a difference (tdesktop's DataIsLoaded).

const selfId = 1 as UserId;
const userId = 7 as UserId;
const botId = 9 as UserId;
const chatId = 20 as ChatId;

function setup() {
  const {manager, saved} = createUpdatesManager();
  const users = new Set<UserId>([selfId, userId, botId]);
  manager.appUsersManager.hasUser = (id: UserId) => users.has(id);
  manager.appPeersManager = {getPeerId, peerId: selfId.toPeerId(false), getOutputPeer: outputPeer};
  const getDifference = manager.getDifference = vi.fn();

  return {manager, saved, users, getDifference};
}

const sentViaBot = {
  pFlags: {},
  message: 'found it',
  pts: 2,
  pts_count: 1,
  date: 2,
  via_bot_id: botId
};

const shortMessage: Updates.updateShortMessage = {
  _: 'updateShortMessage',
  id: 5,
  user_id: userId,
  ...sentViaBot
};

const shortChatMessage: Updates.updateShortChatMessage = {
  _: 'updateShortChatMessage',
  id: 6,
  from_id: userId,
  chat_id: chatId,
  ...sentViaBot
};

describe('a short message sent via an inline bot', () => {
  test.each([
    ['a private chat', shortMessage],
    ['a basic group', shortChatMessage]
  ])('in %s keeps the bot', (_, updates) => {
    const {manager, saved} = setup();

    manager.processUpdateMessage(updates);

    expect(saved.map((update) => update._)).toEqual(['updateNewMessage']);
    expect(((saved[0] as Update.updateNewMessage).message as Message.message).via_bot_id).toBe(botId);
  });

  test('of a bot the client does not know waits for a difference', () => {
    const {manager, saved, users, getDifference} = setup();
    users.delete(botId);

    manager.processUpdateMessage(shortMessage);

    expect(saved).toEqual([]);
    expect(getDifference).toHaveBeenCalled();
  });
});
