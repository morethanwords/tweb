import {Chat, User} from '@layer';
import '@helpers/peerIdPolyfill';

const peers: {[peerId: PeerId]: Chat | User} = {};

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getPeer: (peerId: PeerId) => peers[peerId]
  }
}));

const BOT_ID = 100 as UserId;
const USER_ID = 101 as UserId;
const CHANNEL_ID = 200 as ChatId;
const MONOFORUM_ID = 201 as ChatId;
const GROUP_ID = 202 as ChatId;

describe('stars spend purpose peer', () => {
  let getStarsSpendPurposePeerId: typeof import('@helpers/getStarsSpendPurposePeerId').default;

  beforeAll(async() => {
    getStarsSpendPurposePeerId = (await import('@helpers/getStarsSpendPurposePeerId')).default;

    peers[BOT_ID.toPeerId(false)] = {_: 'user', id: BOT_ID, pFlags: {bot: true}} as User.user;
    peers[USER_ID.toPeerId(false)] = {_: 'user', id: USER_ID, pFlags: {}} as User.user;
    peers[CHANNEL_ID.toPeerId(true)] = {_: 'channel', id: CHANNEL_ID, pFlags: {broadcast: true}} as Chat.channel;
    peers[MONOFORUM_ID.toPeerId(true)] = {
      _: 'channel',
      id: MONOFORUM_ID,
      pFlags: {monoforum: true},
      linked_monoforum_id: CHANNEL_ID
    } as Chat.channel;
    peers[GROUP_ID.toPeerId(true)] = {_: 'chat', id: GROUP_ID, pFlags: {}} as Chat.chat;
  });

  test('bots and channels are a spend purpose', () => {
    expect(getStarsSpendPurposePeerId(BOT_ID.toPeerId(false))).toBe(BOT_ID.toPeerId(false));
    expect(getStarsSpendPurposePeerId(CHANNEL_ID.toPeerId(true))).toBe(CHANNEL_ID.toPeerId(true));
  });

  test('monoforum resolves to its broadcast', () => {
    expect(getStarsSpendPurposePeerId(MONOFORUM_ID.toPeerId(true))).toBe(CHANNEL_ID.toPeerId(true));
  });

  test('regular users, basic groups and unknown peers are not a spend purpose', () => {
    expect(getStarsSpendPurposePeerId(USER_ID.toPeerId(false))).toBeUndefined();
    expect(getStarsSpendPurposePeerId(GROUP_ID.toPeerId(true))).toBeUndefined();
    expect(getStarsSpendPurposePeerId((999 as UserId).toPeerId(false))).toBeUndefined();
    expect(getStarsSpendPurposePeerId(undefined)).toBeUndefined();
  });
});
