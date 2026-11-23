import SlicedArray from '@helpers/slicedArray';

// * A stored slice can hold a mid the server never returns: a local message (a send that is still going or has
// * failed, "You joined this channel") sits between two server messages, at a fractional mid. A page from the
// * server that overlaps such a slice has to join it by value: every message of the page past the stored slice ends
// * up in the history once, and nothing of the stored slice is lost.
function joined(...slices: number[][]) {
  const sliced = new SlicedArray<number>();
  slices.forEach((slice) => sliced.insertSlice(slice));
  return sliced.slices.map((slice) => [...slice]);
}

describe('SlicedArray joins an overlapping slice by value', () => {
  test('older messages below a stored slice with a local message in the overlap', () => {
    expect(joined([10, 9, 8.0001, 8, 7], [10, 9, 8, 7, 6, 5])).toEqual([[10, 9, 8.0001, 8, 7, 6, 5]]);
  });

  test('newer messages above a stored slice with a local message in the overlap', () => {
    expect(joined([10, 9.0001, 9, 8, 7], [13, 12, 11, 10, 9, 8])).toEqual([[13, 12, 11, 10, 9.0001, 9, 8, 7]]);
  });

  // * what lies inside the stored range is the stored slice's own business (both bounds found adds nothing either):
  // * only the part of the page beyond it is added, once
  test('a stored slice that lacks a message of the page takes the page\'s part beyond it once', () => {
    expect(joined([10, 8, 7], [10, 9, 8, 7, 6, 5])).toEqual([[10, 8, 7, 6, 5]]);
    expect(joined([10, 9, 7], [13, 12, 11, 10, 9, 8, 7])).toEqual([[13, 12, 11, 10, 9, 7]]);
  });

  test('two slices joined by a third that overlaps both', () => {
    expect(joined([20, 19, 18.0001, 18, 17], [12, 11, 10], [19, 18, 17, 16, 15, 14, 13, 12]))
    .toEqual([[20, 19, 18.0001, 18, 17, 16, 15, 14, 13, 12, 11, 10]]);
  });
});
