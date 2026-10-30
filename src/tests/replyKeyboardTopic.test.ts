import '@helpers/peerIdPolyfill';
import ListenerSetter from '@helpers/listenerSetter';
import EventListenerBase from '@helpers/eventListenerBase';
import {getMiddleware} from '@helpers/middleware';
import {ChatType} from '@components/chat/chatType';
import {ReplyMarkup} from '@layer';

// only the panel's contents need these, and they pull in the whole message renderer
vi.mock('@components/wrappers/keyboardButton', () => ({default: vi.fn()}));
vi.mock('@components/chat/bubbleParts/replyMarkupLayout', () => ({default: {}}));

let ReplyKeyboard: typeof import('@components/chat/replyKeyboard')['default'];

beforeAll(async() => {
  ReplyKeyboard = (await import('@components/chat/replyKeyboard')).default;
});

const PEER_ID = 100 as PeerId;

function makeKeyboard(chat: object) {
  const btnHover = document.createElement('button');
  const replyKeyboard = new ReplyKeyboard({
    listenerSetter: new ListenerSetter(),
    managers: {} as any,
    appendTo: document.createElement('div'),
    btnHover,
    // * the app's, whose chat changes and column changes it follows
    chatInput: {chat: {appImManager: new EventListenerBase(), ...chat}} as any,
    middleware: getMiddleware().get()
  });

  return {btnHover, replyKeyboard};
}

const keyboard = (mid: number): ReplyMarkup.replyKeyboardMarkup => ({
  _: 'replyKeyboardMarkup',
  pFlags: {},
  rows: [{_: 'keyboardButtonRow', buttons: [{_: 'keyboardButton', text: 'A', type: {_: 'buttonTypeDefault'}}]}],
  mid
});

describe('reply keyboard in a topic', () => {
  test('shows the keyboard the topic\'s own last bot message brought', async() => {
    const {btnHover, replyKeyboard} = makeKeyboard({
      type: ChatType.Chat,
      peerId: PEER_ID,
      threadId: 42,
      // the bot answered in this topic; the chat's own storage has no keyboard for it
      historyStorage: {replyMarkup: keyboard(43)},
      historyStorageNoThreadId: {}
    });

    expect(await replyKeyboard.checkAvailability()).toBe(true);
    expect(btnHover.classList.contains('hide')).toBe(false);
  });

  test('does not show a keyboard another topic got', async() => {
    const {btnHover, replyKeyboard} = makeKeyboard({
      type: ChatType.Chat,
      peerId: PEER_ID,
      threadId: 42,
      historyStorage: {},
      historyStorageNoThreadId: {replyMarkup: keyboard(77)}
    });

    expect(await replyKeyboard.checkAvailability()).toBe(false);
    expect(btnHover.classList.contains('hide')).toBe(true);
  });
});

describe('a force reply\'s answer the user drops', () => {
  const forceReplyKeyboard = (mid: number): ReplyMarkup.replyKeyboardMarkup => ({
    ...keyboard(mid),
    pFlags: {force_reply: true, persistent: true}
  });

  function makeChat() {
    const setAppState = vi.fn();
    const {replyKeyboard} = makeKeyboard({
      type: ChatType.Chat,
      peerId: PEER_ID,
      isBot: true,
      historyStorage: {key: 'history_100', replyMarkup: forceReplyKeyboard(43)},
      appState: {},
      setAppState
    });

    return {replyKeyboard, setAppState};
  }

  test('is remembered apart from the keyboards closed, a persistent one to open with the chat still', () => {
    const {replyKeyboard, setAppState} = makeChat();
    replyKeyboard.onReplyDropped(43);
    expect(setAppState.mock.calls).toEqual([['droppedForceReplies', 'history_100', 43]]);
  });

  test('is the chat\'s own message only, not one of another chat with the same id', () => {
    const {replyKeyboard, setAppState} = makeChat();
    replyKeyboard.onReplyDropped(43, (7 as ChatId).toPeerId(true));
    replyKeyboard.onReplyDropped(44);
    expect(setAppState).not.toHaveBeenCalled();
    replyKeyboard.onReplyDropped(43, PEER_ID);
    expect(setAppState).toHaveBeenCalledWith('droppedForceReplies', 'history_100', 43);
  });
});

describe('the placeholder of a closed keyboard', () => {
  function makeChat() {
    return makeKeyboard({
      type: ChatType.Chat,
      peerId: PEER_ID,
      historyStorage: {replyMarkup: {...keyboard(43), placeholder: 'Pick one'}}
    }).replyKeyboard;
  }

  test('stands in the field that answers the message that brought it', () => {
    const replyKeyboard = makeChat();
    expect(replyKeyboard.getPlaceholder(43)).toBe('Pick one');
    expect(replyKeyboard.getPlaceholder(43, PEER_ID)).toBe('Pick one');
    expect(replyKeyboard.getPlaceholder(44)).toBeUndefined();
  });

  test('not in one that answers another chat\'s message with the same id', () => {
    expect(makeChat().getPlaceholder(43, (7 as ChatId).toPeerId(true))).toBeUndefined();
  });
});
