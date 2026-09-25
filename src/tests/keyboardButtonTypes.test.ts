import '@helpers/peerIdPolyfill';
import {IntersectionObserverMock} from '@/tests/mocks/intersectionObserver';
import type {KeyboardButton, KeyboardInlineButton, PageButton} from '@layer';

const mocks = vi.hoisted(() => ({
  setInnerPeer: vi.fn(),
  toggleSidebar: vi.fn(),
  copyTextToClipboard: vi.fn(),
  toastNew: vi.fn()
}));

vi.mock('@environment/webpSupport', () => ({default: false}));
vi.mock('@components/popups/pickUser', () => ({showPickUser3Popup: vi.fn()}));
vi.mock('@components/popups/requestPeer', () => ({default: vi.fn()}));
vi.mock('@components/popups/createBot', () => ({default: vi.fn()}));
vi.mock('@components/confirmationPopup', () => ({default: vi.fn()}));
vi.mock('@components/toast', () => ({toast: vi.fn(), toastNew: mocks.toastNew}));
vi.mock('@components/wrappers/customEmoji', () => ({default: vi.fn()}));
vi.mock('@components/chat/bubbleParts/replyMarkupLayout', () => ({default: {Button: vi.fn()}}));
vi.mock('@lib/solidjs/hotReloadGuardProvider', () => ({default: class {}}));
vi.mock('@lib/rootScope', () => ({default: {managers: {}, addEventListener: vi.fn(), dispatchEvent: vi.fn()}}));
vi.mock('@helpers/clipboard', () => ({copyTextToClipboard: mocks.copyTextToClipboard}));
vi.mock('@lib/appImManager', () => ({default: {setInnerPeer: mocks.setInnerPeer}}));
vi.mock('@components/sidebarRight', () => ({default: {toggleSidebar: mocks.toggleSidebar}}));

let getKeyboardButtonHandler: typeof import('@components/wrappers/keyboardButton')['getKeyboardButtonHandler'];
let getRichPageButtonHandler: typeof import('@components/wrappers/keyboardButton')['getRichPageButtonHandler'];

beforeAll(async() => {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  // what the wrapper's imports load on their own (language data, emoji) is not this test's business
  vi.stubGlobal('fetch', vi.fn(async() => new Response('', {status: 404})));
  ({getKeyboardButtonHandler, getRichPageButtonHandler} = await import('@components/wrappers/keyboardButton'));
});

function makeChat() {
  return {
    peerId: (5 as UserId).toPeerId(false),
    threadId: undefined as number,
    input: {openPollCreation: vi.fn()},
    appImManager: {requestLocation: vi.fn()}
  };
}

const replyButton = (type: KeyboardButton['type'], text = 'Tap'): KeyboardButton => ({_: 'keyboardButton', text, type});

describe('layer 229 button types that used to fall through to plain text', () => {
  beforeEach(() => vi.clearAllMocks());

  test('a location request asks for the position and answers the keyboard\'s message', () => {
    const chat = makeChat();
    const handler = getKeyboardButtonHandler({
      button: replyButton({_: 'buttonTypeRequestGeoLocation'}),
      chat: chat as any,
      replyMarkup: {_: 'replyKeyboardMarkup', pFlags: {}, rows: [], mid: 77}
    });

    handler.onClick(new MouseEvent('click'));
    expect(chat.appImManager.requestLocation).toHaveBeenCalledWith({
      peerId: chat.peerId,
      threadId: undefined,
      replyToMsgId: 77
    });
  });

  test('a poll request opens poll creation with the kind the bot asked for', () => {
    const chat = makeChat();
    getKeyboardButtonHandler({
      button: replyButton({_: 'buttonTypeRequestPoll', quiz: true}),
      chat: chat as any
    }).onClick(new MouseEvent('click'));
    expect(chat.input.openPollCreation).toHaveBeenCalledWith({quiz: true});

    getKeyboardButtonHandler({
      button: replyButton({_: 'buttonTypeRequestPoll'}),
      chat: chat as any
    }).onClick(new MouseEvent('click'));
    expect(chat.input.openPollCreation).toHaveBeenLastCalledWith({quiz: undefined});
  });

  test('a profile button opens the user\'s profile', async() => {
    const button: KeyboardInlineButton = {
      _: 'keyboardInlineButton',
      text: 'Durov',
      type: {_: 'inlineButtonTypeUserProfile', user_id: 1}
    };
    getKeyboardButtonHandler({button, chat: makeChat() as any}).onClick(new MouseEvent('click'));
    await vi.waitFor(() => expect(mocks.toggleSidebar).toHaveBeenCalledWith(true));
    expect(mocks.setInnerPeer).toHaveBeenCalledWith({peerId: (1 as UserId).toPeerId(false)});
  });

  test('a page read on its own copies, but cannot answer a callback', () => {
    const copy: PageButton = {_: 'pageButton', text: {_: 'textPlain', text: 'Copy'}, type: {_: 'inlineButtonTypeCopy', copy_text: 'code'}};
    const copyHandler = getRichPageButtonHandler({button: copy, label: 'Copy'});
    expect(copyHandler.unavailable).toBeUndefined();
    expect(copyHandler.icon).toBe('copy');
    copyHandler.onClick(new MouseEvent('click'));
    expect(mocks.copyTextToClipboard).toHaveBeenCalledWith('code');

    const callback: PageButton = {
      _: 'pageButton',
      text: {_: 'textPlain', text: 'Press'},
      type: {_: 'inlineButtonTypeCallback', pFlags: {}, data: new Uint8Array([1])}
    };
    const callbackHandler = getRichPageButtonHandler({button: callback, label: 'Press'});
    expect(callbackHandler.unavailable).toBe(true);
    expect(callbackHandler.onClick).toBeUndefined();
  });
});
