/*
 * Unit tests for computeStickerSetPreviewGrid — the square-grid geometry for the
 * sticker-set / custom-emoji webpage preview. Mirrors tdesktop's
 * history_view_web_page.cpp:1067-1068 (side = ceil(sqrt(count)), single = box/side).
 */

import {describe, expect, it} from 'vitest';
import computeStickerSetPreviewGrid from '@helpers/stickerSetPreviewGrid';

describe('computeStickerSetPreviewGrid', () => {
  it('count 1 -> side 1', () => {
    expect(computeStickerSetPreviewGrid(1).side).toBe(1);
  });

  it('count 2,3,4 -> side 2', () => {
    for(const count of [2, 3, 4]) {
      expect(computeStickerSetPreviewGrid(count).side).toBe(2);
    }
  });

  it('count 5..9 -> side 3', () => {
    for(let count = 5; count <= 9; ++count) {
      expect(computeStickerSetPreviewGrid(count).side).toBe(3);
    }
  });

  it('count 10..16 -> side 4', () => {
    for(let count = 10; count <= 16; ++count) {
      expect(computeStickerSetPreviewGrid(count).side).toBe(4);
    }
  });

  it('count 0 -> side 1 (clamped, no NaN / divide-by-zero)', () => {
    const {side, cellSize} = computeStickerSetPreviewGrid(0);
    expect(side).toBe(1);
    expect(Number.isNaN(cellSize)).toBe(false);
    expect(Number.isFinite(cellSize)).toBe(true);
  });

  it('cellSize === floor(boxSize / side) for boxSize 56', () => {
    expect(computeStickerSetPreviewGrid(5, 56).cellSize).toBe(18); // side 3 -> floor(56/3) = 18
    expect(computeStickerSetPreviewGrid(4, 56).cellSize).toBe(28); // side 2 -> floor(56/2) = 28
    expect(computeStickerSetPreviewGrid(1, 56).cellSize).toBe(56); // side 1 -> 56
  });

  it('returns the boxSize unchanged', () => {
    expect(computeStickerSetPreviewGrid(7, 56).boxSize).toBe(56);
    expect(computeStickerSetPreviewGrid(7, 80).boxSize).toBe(80);
  });

  it('cellSize is always a positive integer for counts 1..25', () => {
    for(let count = 1; count <= 25; ++count) {
      const {cellSize} = computeStickerSetPreviewGrid(count);
      expect(Number.isInteger(cellSize)).toBe(true);
      expect(cellSize).toBeGreaterThan(0);
    }
  });
});
