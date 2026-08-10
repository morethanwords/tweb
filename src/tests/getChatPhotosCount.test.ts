import getChatPhotosCount from '@helpers/getChatPhotosCount';

describe('getChatPhotosCount', () => {
  test('keeps the server count when the current photo has a service message', () => {
    // 3 photos in the history, the current one spliced out of the loaded page
    expect(getChatPhotosCount(3, 2, false)).toBe(3);
  });

  test('counts the synthesized current photo on top of the history', () => {
    // the whole history stays loaded, the current photo is one item more
    expect(getChatPhotosCount(1, 1, true)).toBe(2);
  });

  test('counts a chat whose only photo has no service message', () => {
    expect(getChatPhotosCount(0, 0, true)).toBe(1);
  });

  test('falls back to the loaded length when there is no server count', () => {
    expect(getChatPhotosCount(undefined, 2, false)).toBe(2);
    expect(getChatPhotosCount(undefined, 2, true)).toBe(3);
  });
});
