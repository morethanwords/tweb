import {describe, expect, it} from 'vitest';
import {
  GroupCallTileRect,
  getVideoBox,
  layoutColumn,
  layoutList,
  layoutStage
} from '@components/groupCall/videoLayout';

const landscape = {width: 1280, height: 720};
const portrait = {width: 720, height: 1280};

function expectInsideWithoutOverlaps(rects: GroupCallTileRect[], width: number, height: number) {
  rects.forEach((rect) => {
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(height);
  });

  rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => {
    const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlaps).toBe(false);
  }));
}

describe('group call stage layout', () => {
  it('gives a lone tile the whole stage', () => {
    expect(layoutStage([landscape], 900, 500)).toEqual([{x: 0, y: 0, width: 900, height: 500}]);
  });

  it('puts two cameras side by side on a wide stage', () => {
    // two 497px columns (1000 + 6 gap, halved, minus the gap) letterbox far less than two 197px rows
    expect(layoutStage([landscape, landscape], 1000, 400)).toEqual([
      {x: 0, y: 0, width: 497, height: 400},
      {x: 503, y: 0, width: 497, height: 400}
    ]);
  });

  it('stacks two cameras on a tall stage', () => {
    expect(layoutStage([landscape, landscape], 400, 1000)).toEqual([
      {x: 0, y: 0, width: 400, height: 497},
      {x: 0, y: 503, width: 400, height: 497}
    ]);
  });

  it('stands two upright phone cameras side by side even on a squarish stage', () => {
    const [a, b] = layoutStage([portrait, portrait], 600, 600);
    expect(a.y).toBe(b.y);
    expect(a.height).toBe(600);
  });

  it('spreads five tiles over three slices as 2 + 2 + 1 and fills the stage', () => {
    const rects = layoutStage(Array(5).fill(landscape), 1200, 675);
    expectInsideWithoutOverlaps(rects, 1200, 675);

    // whichever way it sliced, three slices hold two, two and one tile
    const byColumn = new Map<number, number>();
    const byRow = new Map<number, number>();
    rects.forEach((rect) => {
      byColumn.set(rect.x, (byColumn.get(rect.x) || 0) + 1);
      byRow.set(rect.y, (byRow.get(rect.y) || 0) + 1);
    });
    const slices = byColumn.size === 3 ? [...byColumn.values()] : [...byRow.values()];
    expect(slices).toEqual([2, 2, 1]);
    // and the last slice's lone tile spans it
    const last = rects[4];
    expect(byColumn.size === 3 ? last.height : last.width).toBe(byColumn.size === 3 ? 675 : 1200);
  });

  it('keeps twelve tiles inside the stage without overlaps', () => {
    expectInsideWithoutOverlaps(layoutStage(Array(12).fill(landscape), 1000, 560), 1000, 560);
  });
});

describe('group call list layout', () => {
  it('gives a lone camera the width at 16:9, and a gap before the list', () => {
    // 404 * 9 / 16 = 227.25, inside the 16:9..4:3 band
    expect(layoutList([landscape], 404, false)).toEqual({
      rects: [{x: 0, y: 0, width: 404, height: 227}],
      height: 231
    });
  });

  it('lets a pinned upright video grow to 4:3 of the width at most', () => {
    const {rects} = layoutList([portrait, landscape], 404, true);
    expect(rects[0]).toEqual({x: 0, y: 0, width: 404, height: 303});
  });

  it('pairs cameras into squares, an odd one out spanning its own row on top', () => {
    // half = floor((404 - 4) / 2) = 200
    expect(layoutList([landscape, landscape, landscape], 404, false)).toEqual({
      rects: [
        {x: 0, y: 0, width: 404, height: 200},
        {x: 0, y: 204, width: 200, height: 200},
        {x: 204, y: 204, width: 200, height: 200}
      ],
      height: 408
    });
  });

  it('puts the rest of a pinned list in pairs below the pinned tile', () => {
    const {rects, height} = layoutList([landscape, landscape, landscape], 404, true);
    expect(rects).toEqual([
      {x: 0, y: 0, width: 404, height: 227},
      {x: 0, y: 231, width: 200, height: 200},
      {x: 204, y: 231, width: 200, height: 200}
    ]);
    expect(height).toBe(435);
  });

  it('takes no room without tiles', () => {
    expect(layoutList([], 404, false)).toEqual({rects: [], height: 0});
    expect(layoutColumn(0, 280)).toEqual({rects: [], height: 0});
  });
});

describe('group call column layout', () => {
  it('stacks 16:9 tiles the width of the column', () => {
    // 280 * 9 / 16 = 157.5
    expect(layoutColumn(2, 280)).toEqual({
      rects: [
        {x: 0, y: 0, width: 280, height: 158},
        {x: 0, y: 162, width: 280, height: 158}
      ],
      height: 324
    });
  });
});

describe('video box', () => {
  const box = (aspect: number, width: number, height: number, maxCrop: number) => {
    const {width: w, height: h} = getVideoBox(aspect, width, height, maxCrop);
    return [+w.toFixed(2), +h.toFixed(2)];
  };

  it('fills a tile when that cuts off little enough', () => {
    // 444.44 wide: a tenth of the frame is cut
    expect(box(16 / 9, 400, 250, 0.2)).toEqual([444.44, 250]);
  });

  it('cuts off no more than allowed, and shows the rest of the tile around the picture', () => {
    // filling would cut a quarter; a fifth is cut, and 9.4 px are left above and below
    expect(box(16 / 9, 400, 300, 0.2)).toEqual([500, 281.25]);
    // portrait in a landscape tile: 55% of its height is shown
    expect(box(9 / 16, 320, 180, 0.45)).toEqual([184.09, 327.27]);
  });

  it('fits the whole frame in without a crop', () => {
    expect(box(16 / 9, 400, 300, 0)).toEqual([400, 225]);
    expect(box(9 / 16, 320, 180, 0)).toEqual([101.25, 180]);
  });

  it('follows a tile that grows taller without a jump', () => {
    // the old cover/contain switch dropped the picture from 200 px high to 160 at once
    let previous: number;
    for(let height = 150; height <= 260; height += 0.5) {
      const {height: boxHeight} = getVideoBox(16 / 9, 285, height, 0.2);
      if(previous !== undefined) {
        expect(Math.abs(boxHeight - previous)).toBeLessThanOrEqual(1);
      }

      previous = boxHeight;
    }
  });
});
