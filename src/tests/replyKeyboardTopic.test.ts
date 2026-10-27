import '@helpers/peerIdPolyfill';
import ListenerSetter from '@helpers/listenerSetter';
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
    chatInput: {chat} as any,
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
