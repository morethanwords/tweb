import '@helpers/peerIdPolyfill';
import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';
import deferredPromise from '@helpers/cancellablePromise';
import pause from '@helpers/schedulers/pause';
import rootScope from '@lib/rootScope';

const mocks = vi.hoisted(() => ({
  confirmationPopup: vi.fn(),
  listeners: undefined as Record<string, (...args: any[]) => any>,
  dispatched: [] as Array<{type: string, data: any}>
}));

vi.mock('@components/confirmationPopup', () => ({default: mocks.confirmationPopup}));
// * the frame's bridge: what the mini app asks for, and what it is answered
vi.mock('@components/telegramWebView', () => ({
  default: class {
    public iframe = document.createElement('iframe');
    public lastDispatchedWebViewEvent: any;
    public addMultipleEventsListeners(listeners: typeof mocks.listeners) {
      mocks.listeners = listeners;
    }
    public dispatchWebViewEvent(type: string, data: any) {
      mocks.dispatched.push({type, data});
    }
  }
}));

const BOT_ID = 777 as BotId;
const MY_ID = (42 as UserId).toPeerId(false);

let WebApp: typeof import('@components/webApp')['default'];

beforeAll(async() => {
  stubBrowserGlobals();
  // * what the mini app's imports load on their own (language data, emoji) is not this test's business
  vi.stubGlobal('fetch', vi.fn(async() => new Response('', {status: 404})));
  ({default: WebApp} = await import('@components/webApp'));
});

let previousMyId: PeerId;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.listeners = undefined;
  mocks.dispatched.length = 0;
  previousMyId = rootScope.myId;
  rootScope.myId = MY_ID;
});

afterEach(() => {
  rootScope.myId = previousMyId;
});

function openMiniApp({isBotBlocked = true}: {isBotBlocked?: boolean} = {}) {
  const calls: string[] = [];
  const managers = {
    appProfileManager: {
      isUserBlocked: vi.fn(async(_userId: UserId) => isBotBlocked)
    },
    appMessagesManager: {
      unblockBot: vi.fn(async(_botId: BotId) => {
        calls.push('unblock');
      }),
      sendContact: vi.fn(async(_options: any) => {
        calls.push('send');
      })
    }
  };

  const webApp = Object.assign(Object.create(WebApp.prototype), {
    webViewResultUrl: {_: 'webViewResultUrl', url: 'https://bot.example/', pFlags: {}},
    webViewOptions: {botId: BOT_ID},
    managers
  });
  webApp.createWebView();

  const requestPhone = async() => {
    await mocks.listeners.web_app_request_phone(undefined);
    return mocks.dispatched.filter(({type}) => type === 'phone_requested').map(({data}) => data);
  };

  return {managers, calls, requestPhone};
}

describe('a mini app asking for the phone number', () => {
  test('leaves a blocked bot blocked while the user has not answered', async() => {
    const answer = deferredPromise<void>();
    mocks.confirmationPopup.mockReturnValue(answer);
    const {managers, requestPhone} = openMiniApp();

    const requested = requestPhone();
    await pause(0);
    expect(managers.appMessagesManager.unblockBot).not.toHaveBeenCalled();
    expect(mocks.confirmationPopup).toHaveBeenCalledTimes(1);

    answer.reject();
    await requested;
  });

  test('a cancel or a closed popup unblocks nothing and sends nothing', async() => {
    mocks.confirmationPopup.mockRejectedValue(undefined);
    const {managers, requestPhone} = openMiniApp();

    expect(await requestPhone()).toEqual([{status: 'cancelled'}]);
    expect(managers.appMessagesManager.unblockBot).not.toHaveBeenCalled();
    expect(managers.appMessagesManager.sendContact).not.toHaveBeenCalled();
  });

  test('agreeing unblocks the bot first, then sends it the contact', async() => {
    mocks.confirmationPopup.mockResolvedValue(undefined);
    const {managers, calls, requestPhone} = openMiniApp();

    expect(await requestPhone()).toEqual([{status: 'sent'}]);
    expect(managers.appMessagesManager.unblockBot).toHaveBeenCalledWith(BOT_ID);
    expect(managers.appMessagesManager.sendContact).toHaveBeenCalledWith({
      peerId: BOT_ID.toPeerId(false),
      contactPeerId: MY_ID
    });
    expect(calls).toEqual(['unblock', 'send']);
  });

  test('the question says a blocked bot will be unblocked too', async() => {
    mocks.confirmationPopup.mockRejectedValue(undefined);
    const {managers, requestPhone} = openMiniApp();

    await requestPhone();
    expect(managers.appProfileManager.isUserBlocked).toHaveBeenCalledWith(BOT_ID);
    const [{description, descriptionLangKey}] = mocks.confirmationPopup.mock.calls[0];
    expect(descriptionLangKey).toBeUndefined();
    // * no language pack is loaded here: a string renders as its key
    expect(description.textContent).toBe('AreYouSureShareMyContactInfoBot\n\nAreYouSureShareMyContactInfoBotUnblock');
  });

  test('a bot that is not blocked is asked about the number alone, and nothing is unblocked', async() => {
    mocks.confirmationPopup.mockResolvedValue(undefined);
    const {managers, calls, requestPhone} = openMiniApp({isBotBlocked: false});

    expect(await requestPhone()).toEqual([{status: 'sent'}]);
    const [{description, descriptionLangKey}] = mocks.confirmationPopup.mock.calls[0];
    expect(descriptionLangKey).toBe('AreYouSureShareMyContactInfoBot');
    expect(description).toBeUndefined();
    expect(managers.appMessagesManager.unblockBot).not.toHaveBeenCalled();
    expect(calls).toEqual(['send']);
  });

  test('a bot that could not be unblocked gets no contact, and the app hears the request was cancelled', async() => {
    mocks.confirmationPopup.mockResolvedValue(undefined);
    const {managers, requestPhone} = openMiniApp();
    managers.appMessagesManager.unblockBot.mockRejectedValue({type: 'FLOOD_WAIT_5'});

    expect(await requestPhone()).toEqual([{status: 'cancelled'}]);
    expect(managers.appMessagesManager.sendContact).not.toHaveBeenCalled();
  });
});
