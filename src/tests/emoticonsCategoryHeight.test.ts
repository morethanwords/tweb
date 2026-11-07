import autoFillGridHeight from '@components/emoticonsDropdown/gridHeight';

// The height a pack of the emoji or sticker tab keeps while its items are out of sight (they are taken out of it then):
// that of its rows as the grid's auto-fill lays them out, a gap between each two
describe('autoFillGridHeight', () => {
  it('fits as many in a row as auto-fill does', () => {
    // 8 x 42 + 7 x 6 = 378: eight a row, four rows of 32
    expect(autoFillGridHeight(378, 32, 42, 6, 6)).toBe(4 * 42 + 3 * 6);
    // a pixel less: seven, five rows
    expect(autoFillGridHeight(377, 32, 42, 6, 6)).toBe(5 * 42 + 4 * 6);
    // the dropdown's emoji: 4 px across, none down; 7 x 42 + 6 x 4 = 318, seven a row
    expect(autoFillGridHeight(318, 15, 42, 4, 0)).toBe(3 * 42);
  });

  it('is nothing for no items', () => {
    expect(autoFillGridHeight(378, 0, 42, 6, 6)).toBe(0);
  });
});
