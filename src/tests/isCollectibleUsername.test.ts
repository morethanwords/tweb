import {Chat, User} from '@layer';
import isCollectibleUsername from '@appManagers/utils/peers/isCollectibleUsername';

const username = (name: string, editable?: boolean, active = true) => ({
  _: 'username' as const,
  pFlags: {...(editable ? {editable: true as const} : {}), ...(active ? {active: true as const} : {})},
  username: name
});

describe('isCollectibleUsername', () => {
  test('a peer with a single username has nothing collectible', () => {
    const user = {_: 'user', id: 1, pFlags: {}, username: 'own'} as User.user;
    expect(isCollectibleUsername(user, 'own')).toBe(false);
  });

  test('every username but the editable one was bought', () => {
    const user = {
      _: 'user',
      id: 1,
      pFlags: {},
      usernames: [username('own', true), username('bought'), username('hidden', false, false)]
    } as User.user;

    expect(isCollectibleUsername(user, 'own')).toBe(false);
    expect(isCollectibleUsername(user, 'bought')).toBe(true);
    expect(isCollectibleUsername(user, 'hidden')).toBe(true);
    expect(isCollectibleUsername(user, 'someone_else')).toBe(false);
  });

  test('a channel whose every username was bought', () => {
    const channel = {_: 'channel', id: 1, pFlags: {}, usernames: [username('gram'), username('toncoin')]} as Chat.channel;
    expect(isCollectibleUsername(channel, 'gram')).toBe(true);
    expect(isCollectibleUsername(channel, 'toncoin')).toBe(true);
  });

  test('no peer', () => {
    expect(isCollectibleUsername(undefined, 'any')).toBe(false);
  });
});
