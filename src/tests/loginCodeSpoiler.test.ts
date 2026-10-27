import type {Message} from '@layer';
import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';
import {SERVICE_PEER_ID, VERIFICATION_CODES_BOT_ID} from '@appManagers/constants';
import getLoginCodeEntity from '@appManagers/utils/messages/getLoginCodeEntity';

// wrapRichText's graph starts the app's workers on import, messageForReply's builds the sidebars
vi.mock('@lib/apiManagerProxy', () => ({default: new Proxy({}, {get: () => vi.fn()})}));
vi.mock('@components/sidebarLeft', () => ({default: new Proxy({}, {get: () => vi.fn()})}));
vi.mock('@components/sidebarRight', () => ({default: new Proxy({}, {get: () => vi.fn()})}));

const LOGIN_TEXT = 'رمز الدخول: 62095. لا تعطه أبدًا لأي شخص كان، حتى لو ادعى أنه من تيليجرام!';

describe('getLoginCodeEntity', () => {
  it('finds the code in a message from the service notifications or the codes bot only', () => {
    expect(getLoginCodeEntity(SERVICE_PEER_ID, LOGIN_TEXT)).toEqual({
      _: 'messageEntitySpoiler',
      offset: LOGIN_TEXT.indexOf('62095'),
      length: 5
    });
    expect(getLoginCodeEntity(VERIFICATION_CODES_BOT_ID, 'Your code: 1234')).toEqual({
      _: 'messageEntitySpoiler',
      offset: 11,
      length: 4
    });
    expect(getLoginCodeEntity(1, LOGIN_TEXT)).toBeUndefined();
    expect(getLoginCodeEntity(SERVICE_PEER_ID, 'No code here')).toBeUndefined();
  });
});

// the first import of messageForReply's graph is most of this test: ~20 s on a cold cache
describe('wrapMessageForReply', {timeout: 60_000}, () => {
  const message = (peerId: PeerId, fromId: PeerId): Message.message => ({
    _: 'message',
    pFlags: {},
    id: 1,
    mid: 1,
    date: 1,
    message: LOGIN_TEXT,
    peer_id: {_: 'peerUser', user_id: peerId},
    peerId,
    fromId
  });

  async function wrapPlain(message: Message.message) {
    stubBrowserGlobals();
    const {default: wrapMessageForReply} = await import('@components/wrappers/messageForReply');
    return wrapMessageForReply({
      message,
      managers: {} as any, // * a message with no media asks them nothing
      plain: true
    });
  }

  it('hides a login code in the text a notification shows', async() => {
    const text = await wrapPlain(message(SERVICE_PEER_ID, SERVICE_PEER_ID));
    const offset = LOGIN_TEXT.indexOf('62095');

    expect(text).not.toContain('62095');
    expect(text).toHaveLength(LOGIN_TEXT.length);
    expect(text.slice(0, offset)).toBe(LOGIN_TEXT.slice(0, offset));
    expect(text.slice(offset + 5)).toBe(LOGIN_TEXT.slice(offset + 5));
  });

  it('leaves the digits of anyone else, and of an outgoing message, as they are', async() => {
    expect(await wrapPlain(message(1, 1))).toBe(LOGIN_TEXT);
    expect(await wrapPlain(message(SERVICE_PEER_ID, 2))).toBe(LOGIN_TEXT);
  });
});
