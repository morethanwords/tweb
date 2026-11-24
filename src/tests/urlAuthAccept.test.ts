/*
 * A login button (keyboardButtonUrlAuth) the user agrees to log in with opens its link whatever the server answers to
 * the agreement, as tdesktop's UrlAuthBox does (boxes/url_auth_box.cpp): the link the login gave, else the button's
 * own - when the server refuses, or asks the same question again - and nothing for an account left meanwhile.
 */

import '@/tests/mocks/chatInputIntegrationUi';

const mocks = vi.hoisted(() => ({
  confirmationPopup: vi.fn(),
  safeWindowOpen: vi.fn()
}));

vi.mock('@components/confirmationPopup', () => ({default: mocks.confirmationPopup}));
vi.mock('@helpers/dom/safeWindowOpen', () => ({default: mocks.safeWindowOpen}));
vi.mock('@components/wrappers/peerTitle', () => ({default: async() => document.createElement('span')}));

import {AppImManager} from '@lib/appImManager';
import '@helpers/peerIdPolyfill';
import type {UrlAuthResult} from '@layer';
import pause from '@helpers/schedulers/pause';

const URL = 'https://example.com/login';
const BOT_ID = 7 as BotId;
const PEER_ID = BOT_ID.toPeerId(false);

const request: UrlAuthResult.urlAuthResultRequest = {
  _: 'urlAuthResultRequest',
  pFlags: {},
  bot: {_: 'user', id: BOT_ID, pFlags: {bot: true}} as any,
  domain: 'example.com'
};

const prototype = AppImManager.prototype as any;

function makeHost(acceptUrlAuth: () => Promise<UrlAuthResult>) {
  return {
    managers: {
      appSeamlessLoginManager: {
        requestUrlAuth: vi.fn(async() => request),
        acceptUrlAuth: vi.fn(acceptUrlAuth)
      }
    }
  };
}

// * the login the user agreed to; asked again, they would cancel it
async function logIn(host: ReturnType<typeof makeHost>) {
  mocks.confirmationPopup.mockResolvedValueOnce([true, false]).mockRejectedValue(new Error('cancelled'));
  await prototype.handleUrlAuth.call(host, {peerId: PEER_ID, mid: 1, buttonId: 2, url: URL});
  await vi.waitFor(() => expect(host.managers.appSeamlessLoginManager.acceptUrlAuth).toHaveBeenCalled());
  await pause(0);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('a login button the user agreed to', () => {
  test('opens the link the login gave', async() => {
    const host = makeHost(async() => ({_: 'urlAuthResultAccepted', url: 'https://example.com/logged-in'}));
    await logIn(host);

    expect(mocks.safeWindowOpen).toHaveBeenCalledWith('https://example.com/logged-in');
  });

  test('opens its own link when the server refuses the login', async() => {
    const host = makeHost(async() => {
      throw {type: 'URL_INVALID'};
    });
    await logIn(host);

    expect(mocks.safeWindowOpen).toHaveBeenCalledWith(URL);
  });

  test('opens its own link when the server asks again, instead of asking the user again', async() => {
    const host = makeHost(async() => request);
    await logIn(host);

    expect(mocks.confirmationPopup).toHaveBeenCalledTimes(1);
    expect(mocks.safeWindowOpen).toHaveBeenCalledWith(URL);
  });

  test('opens nothing for an account left meanwhile', async() => {
    const host = makeHost(async() => {
      throw {type: 'MIDDLEWARE'};
    });
    await logIn(host);

    expect(mocks.safeWindowOpen).not.toHaveBeenCalled();
  });
});
