vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    addSharedObjectURLUpdateListener: vi.fn(),
    invoke: vi.fn(),
    invokeVoid: vi.fn()
  }
}));

import {getWallPaperImageGeometry} from '@helpers/files/prepareWallPaperImage';

describe('getWallPaperImageGeometry', () => {
  test('a picture that fits is kept whole and at its size', () => {
    const {crop, size} = getWallPaperImageGeometry(1200, 1600);
    expect(crop).toBeUndefined();
    expect([size.width, size.height]).toEqual([1200, 1600]);
  });

  test('a large photo is fitted into 2960 on its longest side', () => {
    // * the picture the server refused with WALLPAPER_DIMENSIONS_INVALID
    const {crop, size} = getWallPaperImageGeometry(6199, 3871);
    expect(crop).toBeUndefined();
    expect([size.width, size.height]).toEqual([2960, 1848]);

    const portrait = getWallPaperImageGeometry(3024, 4032).size;
    expect([portrait.width, portrait.height]).toEqual([2220, 2960]);
  });

  test('a strip longer than 40:1 is cut around its centre', () => {
    const wide = getWallPaperImageGeometry(10000, 100);
    expect(wide.crop).toEqual({x: 3000, y: 0, width: 4000, height: 100});
    expect([wide.size.width, wide.size.height]).toEqual([2960, 74]);

    const tall = getWallPaperImageGeometry(50, 2100);
    expect(tall.crop).toEqual({x: 0, y: 50, width: 50, height: 2000});
    expect([tall.size.width, tall.size.height]).toEqual([50, 2000]);
  });
});
