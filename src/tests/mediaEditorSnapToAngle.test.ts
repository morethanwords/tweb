import {snapToAngle} from '@components/mediaEditor/utils';
import {NumberPair} from '@components/mediaEditor/types';

const round = ([x, y]: NumberPair) => [Math.round(x), Math.round(y)];

describe('snapToAngle', () => {
  const from: NumberPair = [100, 100];

  it('flattens a nearly horizontal drag', () => {
    expect(round(snapToAngle(from, [300, 112]))).toEqual([300, 100]);
  });

  it('straightens a nearly vertical drag', () => {
    expect(round(snapToAngle(from, [88, 300]))).toEqual([100, 300]);
  });

  it('snaps to the closest diagonal', () => {
    expect(round(snapToAngle(from, [200, 180]))).toEqual([190, 190]);
  });

  it('keeps an exactly diagonal drag untouched', () => {
    expect(round(snapToAngle(from, [250, 250]))).toEqual([250, 250]);
  });

  it('projects onto the snapped ray instead of keeping the drag length', () => {
    // the perpendicular part of the drag must not make the line longer — [304, 100] if it did
    expect(round(snapToAngle(from, [300, 140]))).toEqual([300, 100]);
  });

  it('supports a custom step', () => {
    expect(round(snapToAngle(from, [200, 40], Math.PI / 2))).toEqual([200, 100]);
  });
});
