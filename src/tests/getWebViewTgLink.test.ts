import getWebViewTgLink from '@helpers/getWebViewTgLink';

describe('getWebViewTgLink', () => {
  test('builds a t.me link from the path the frame sent', () => {
    expect(getWebViewTgLink('/durov')).toBe('https://t.me/durov');
    expect(getWebViewTgLink('/durov/123?comment=1')).toBe('https://t.me/durov/123?comment=1');
  });

  // `path_full` is frame-authored: concatenated onto the bare host, a leading dot walks out of the
  // registrable domain ('https://t.me' + '.evil.com/x')
  test('keeps a path that does not start with a slash inside t.me', () => {
    expect(new URL(getWebViewTgLink('.evil.com/x')).host).toBe('t.me');
    expect(new URL(getWebViewTgLink('@evil.com/x')).host).toBe('t.me');
    expect(new URL(getWebViewTgLink('//evil.com/x')).host).toBe('t.me');
  });

  test('survives an empty path', () => {
    expect(getWebViewTgLink('')).toBe('https://t.me/');
    expect(getWebViewTgLink(undefined)).toBe('https://t.me/');
  });
});
