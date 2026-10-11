/*
 * Where the video tiles of a video chat go. Pure geometry: the grid (videoGrid.ts) owns the tiles
 * and only asks this for rectangles.
 *
 * Three places hold tiles:
 * - the stage, the big area of a wide panel: every tile at once, filling it (tdesktop's
 *   `Viewport::countWide`), or the pinned one alone;
 * - the list, above the participants of a narrow panel (tdesktop's `updateTilesGeometryNarrow`);
 * - the column, above the participants beside the stage, for whatever the pinned tile pushed off it.
 */

export type GroupCallTileSize = {width: number, height: number};
export type GroupCallTileRect = {x: number, y: number, width: number, height: number};

// tdesktop's groupCallVideoLargeSkip and groupCallVideoSmallSkip
export const GROUP_CALL_STAGE_GAP = 6;
export const GROUP_CALL_LIST_GAP = 4;

/** What a tile is laid out as until its video tells its real size. */
export const GROUP_CALL_DEFAULT_TILE_SIZE: GroupCallTileSize = {width: 16, height: 9};

/**
 * The box a video of `aspect` takes in a `width`×`height` tile, centred in it: the whole tile as
 * long as filling it cuts no more than `maxCrop` of the frame away, and past that as close to it as
 * that much crop allows, the rest of the tile over the picture's blurred copy. So the picture
 * follows the tile's shape without a jump — a switch from filling to fitting shrank it by up to
 * `maxCrop` in one frame. `maxCrop` 0 fits the whole frame in.
 */
export function getVideoBox(aspect: number, width: number, height: number, maxCrop: number): GroupCallTileSize {
  const fitted = Math.min(width / aspect, height);
  const filled = Math.max(width / aspect, height);
  const boxHeight = Math.min(filled, fitted / (1 - maxCrop));
  return {width: boxHeight * aspect, height: boxHeight};
}

function getLetterbox(size: GroupCallTileSize, width: number, height: number) {
  const scale = Math.min(width / size.width, height / size.height);
  return width * height - size.width * scale * size.height * scale;
}

/**
 * Fills the whole stage: `ceil(sqrt(n))` slices, as columns or as rows, the tiles spread evenly over
 * them (5 tiles: 2 + 2 + 1, every one a little wider than in a ragged grid), and of the two
 * arrangements the one that leaves less of the frames letterboxed — so two cameras sit side by side
 * on a wide stage and on top of each other on a tall one.
 */
export function layoutStage(
  sizes: GroupCallTileSize[],
  width: number,
  height: number,
  gap = GROUP_CALL_STAGE_GAP
): GroupCallTileRect[] {
  const count = sizes.length;
  if(!count) {
    return [];
  } else if(count === 1) {
    return [{x: 0, y: 0, width, height}];
  }

  const slices = Math.ceil(Math.sqrt(count));
  const run = (byColumns: boolean) => {
    const rects: GroupCallTileRect[] = [];
    const [main, cross] = byColumns ? [width, height] : [height, width];
    const sliceSize = (main + gap) / slices;
    let black = 0, index = 0;
    for(let slice = 0; slice < slices; ++slice) {
      const start = Math.round(slice * sliceSize);
      const length = Math.round(slice * sliceSize + sliceSize - gap) - start;
      const inSlice = Math.round((count - index) / (slices - slice));
      const cellSize = (cross + gap) / inSlice;
      for(let cell = 0; cell < inSlice; ++cell, ++index) {
        const cellStart = Math.round(cell * cellSize);
        const cellLength = Math.round(cell * cellSize + cellSize - gap) - cellStart;
        const rect: GroupCallTileRect = byColumns ?
          {x: start, y: cellStart, width: length, height: cellLength} :
          {x: cellStart, y: start, width: cellLength, height: length};
        rects.push(rect);
        black += getLetterbox(sizes[index], rect.width, rect.height);
      }
    }

    return {rects, black};
  };

  const columns = run(true);
  const rows = run(false);
  return (columns.black < rows.black ? columns : rows).rects;
}

/**
 * Tiles above the list of a narrow panel, two to a row.
 *
 * `large`: the first tile spans the width at a height its video fits in (between 16:9 and 4:3) —
 * the pinned one, or a lone one. After it, an odd count gives its first tile a row of its own, the
 * same height as the pairs; the grid puts a landscape video there.
 */
export function layoutList(
  sizes: GroupCallTileSize[],
  width: number,
  large: boolean,
  gap = GROUP_CALL_LIST_GAP
): {rects: GroupCallTileRect[], height: number} {
  const rects: GroupCallTileRect[] = [];
  let y = 0;
  const push = (rect: Omit<GroupCallTileRect, 'y'>) => {
    rects.push({...rect, y});
    y += rect.height + gap;
  };

  let index = 0;
  if(sizes.length && (large || sizes.length === 1)) {
    const size = sizes[0];
    const fitted = Math.min(width * 3 / 4, width * size.height / size.width);
    push({x: 0, width, height: Math.round(Math.max(width * 9 / 16, fitted))});
    index = 1;
  }

  const half = Math.floor((width - gap) / 2);
  if((sizes.length - index) % 2) {
    push({x: 0, width, height: half});
    ++index;
  }

  for(; index < sizes.length; index += 2) {
    rects.push({x: 0, y, width: half, height: half});
    push({x: width - half, width: half, height: half});
  }

  return {rects, height: Math.max(0, y)};
}

/** The column beside the stage: one tile under another, 16:9 each. */
export function layoutColumn(
  count: number,
  width: number,
  gap = GROUP_CALL_LIST_GAP
): {rects: GroupCallTileRect[], height: number} {
  const height = Math.round(width * 9 / 16);
  const rects = Array.from({length: count}, (_, index): GroupCallTileRect => ({
    x: 0,
    y: index * (height + gap),
    width,
    height
  }));

  return {rects, height: count ? count * (height + gap) : 0};
}
