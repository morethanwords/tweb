import {PeerColor, User} from '@layer';
import {getPeerColorStripesCount, setMyPeerColor, setPeerColors} from '@appManagers/utils/peers/getPeerColorById';

const theme = vi.hoisted(() => ({isNight: vi.fn(() => false)}));
vi.mock('@helpers/themeController', () => ({default: theme}));

const makeUser = (color: PeerColor) => ({_: 'user', id: 1, color} as User.user);
const collectible = (colors: number[], dark_colors?: number[]): PeerColor.peerColorCollectible => ({
  _: 'peerColorCollectible',
  collectible_id: 1,
  gift_emoji_id: 1,
  background_emoji_id: 1,
  accent_color: 0xFF0000,
  colors,
  dark_colors
});

const getScopedRule = () => [...document.head.querySelectorAll('style')]
.map((style) => style.textContent)
.find((text) => text.includes('--message-out-peer-1-border-background'));

// * The one-colour stripe templates are made of theme variables. A var() is substituted where
// * the property is declared, so a template set on <html> reaches a chat with its own theme
// * already resolved to the app theme's colours — they must be declared on the theme scopes.
describe('peer colour stripe templates', () => {
  const user = makeUser({_: 'peerColor', color: 0});

  test('are declared on every theme scope, not resolved on the root', () => {
    setPeerColors([], user);

    expect(document.documentElement.style.getPropertyValue('--message-out-peer-1-border-background')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--peer-border-background')).toBe('');
    expect(getScopedRule()).toMatch(/^:root, \.night, \.chat \{/);
    expect(getScopedRule()).toContain('--message-out-peer-1-border-background: var(--message-out-primary-color);');
  });

  test('are rewritten in place rather than stacked', () => {
    setPeerColors([], user);
    setPeerColors([], user);

    const rules = [...document.head.querySelectorAll('style')]
    .filter((style) => style.textContent.includes('--message-out-peer-1-border-background'));
    expect(rules).toHaveLength(1);
  });

  test('follow my own collectible colour', () => {
    setMyPeerColor(makeUser(collectible([0x111111, 0x222222, 0x333333])));
    expect(getScopedRule()).toMatch(/--message-out-peer-border-background: repeating-linear-gradient\([^;]*\.4\)/);

    setMyPeerColor(user);
    expect(getScopedRule()).toContain('--message-out-peer-border-background: var(--message-out-primary-color);');
  });
});

describe('getPeerColorStripesCount', () => {
  afterEach(() => theme.isNight.mockReturnValue(false));

  test('a collectible colour counts its own strip', () => {
    expect(getPeerColorStripesCount(makeUser(collectible([1])))).toBe(1);
    expect(getPeerColorStripesCount(makeUser(collectible([1, 2])))).toBe(2);
    expect(getPeerColorStripesCount(makeUser(collectible([1, 2, 3, 4])))).toBe(3);
  });

  test('a collectible colour uses its dark strip at night', () => {
    const user = makeUser(collectible([1], [1, 2, 3]));
    expect(getPeerColorStripesCount(user)).toBe(1);
    theme.isNight.mockReturnValue(true);
    expect(getPeerColorStripesCount(user)).toBe(3);
  });

  test('an explicit colour wins over the peer\'s, and no peer is one stripe', () => {
    expect(getPeerColorStripesCount(makeUser({_: 'peerColor', color: 0}), collectible([1, 2]))).toBe(2);
    expect(getPeerColorStripesCount(undefined)).toBe(1);
  });
});
