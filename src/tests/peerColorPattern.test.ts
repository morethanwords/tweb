import pickPatternEmojiColor, {PeerColorLike} from '@helpers/pickPatternEmojiColor';

describe('pickPatternEmojiColor', () => {
  const gradient = ['#abcdef', '#123456'];

  test('collectible — light accent when not night', () => {
    const color = {_: 'peerColorCollectible', accent_color: 0xFF0000, dark_accent_color: 0x00FF00} as PeerColorLike;
    expect(pickPatternEmojiColor(color, false, gradient)).toBe('#ff0000');
  });

  test('collectible — dark accent when night and dark_accent_color present', () => {
    const color = {_: 'peerColorCollectible', accent_color: 0xFF0000, dark_accent_color: 0x00FF00} as PeerColorLike;
    expect(pickPatternEmojiColor(color, true, gradient)).toBe('#00ff00');
  });

  test('collectible — falls back to light accent when night but no dark_accent_color', () => {
    const color = {_: 'peerColorCollectible', accent_color: 0xFF0000} as PeerColorLike;
    expect(pickPatternEmojiColor(color, true, gradient)).toBe('#ff0000');
  });

  test('plain peerColor — first gradient color regardless of theme', () => {
    const color = {_: 'peerColor', background_emoji_id: '1'} as PeerColorLike;
    expect(pickPatternEmojiColor(color, false, gradient)).toBe('#abcdef');
    expect(pickPatternEmojiColor(color, true, gradient)).toBe('#abcdef');
  });
});
