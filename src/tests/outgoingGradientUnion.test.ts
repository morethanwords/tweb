import {makeOutgoingGradientPath, movePath, OutgoingGradientShape} from '@components/chat/outgoingGradientUnion';
import {getRadii, Radii} from '@components/chat/bubbleShape';

// * the outgoing tails as the stylesheet cuts them (`.bubble.is-out.is-group-last.can-have-tail .bubble-tail`)
const TAIL_LTR = 'M8 19H2V2c.193 2.84.876 5.767 2.05 8.782.904 2.325 2.446 4.485 4.625 6.48A1 1 0 0 1 8 19z';
const TAIL_RTL = 'M3 19h6V2c-.193 2.84-.876 5.767-2.05 8.782-.904 2.325-2.446 4.485-4.625 6.48A1 1 0 0 0 3 19z';

// * the numbers of a path, in order
const numbers = (path: string) => path.match(/[+-]?(?:\d*\.\d+|\d+\.?)/g).map(Number);
const radii = (topLeft: number, topRight: number, bottomRight: number, bottomLeft: number): Radii => ({topLeft, topRight, bottomRight, bottomLeft});
// * the way each piece of a path goes round
const ways = (path: string) => path.split(/(?=M)/).map((piece) => movePath(piece, 0, 0).way);

describe('the outgoing bubbles\' gradient cut out for a whole chat', () => {
  test('a tail is moved where it stands: its absolute numbers by the place, its relative ones not', () => {
    const {path} = movePath(TAIL_LTR, 100, 50);
    expect(path.startsWith('M108 69H102V52c')).toBe(true);
    expect(path.endsWith('A1 1 0 0 1 108 69z')).toBe(true);
    // * the curve's numbers are where they were
    expect(numbers(path).slice(4, 16)).toEqual(numbers(TAIL_LTR).slice(4, 16).map((value) => Math.round(value * 100) / 100));
  });

  test('a path that starts with a relative move starts where its first numbers say, moved too', () => {
    expect(movePath('m1 2l3 4z', 10, 20).path).toBe('m11 22l3 4z');
  });

  test('a mirrored tail goes round the other way', () => {
    expect(movePath(TAIL_LTR, 0, 0).way).toBe(1);
    expect(movePath(TAIL_RTL, 0, 0).way).toBe(-1);
  });

  test('a bubble is drawn the way round its tail goes, so that where they meet is cut out', () => {
    const bubble: Omit<OutgoingGradientShape, 'tail'> = {left: 20, top: 30, width: 200, height: 40, radii: radii(15, 6, 0, 15)};
    for(const path of [TAIL_LTR, TAIL_RTL]) {
      const drawn = makeOutgoingGradientPath([{...bubble, tail: {left: 215, top: 51, path}}]);
      const [rect, tail] = ways(drawn);
      expect(rect).toBe(tail);
    }

    // * and one with no tail the way of the clock
    expect(ways(makeOutgoingGradientPath([bubble]))).toEqual([1]);
  });

  test('a bubble\'s shape is its box with its corners rounded', () => {
    const path = makeOutgoingGradientPath([{left: 10.123, top: 20, width: 100, height: 50, radii: radii(12, 6, 0, 12)}]);
    expect(path).toBe('M22.12 20H104.12A6 6 0 0 1 110.12 26V70A0 0 0 0 1 110.12 70H22.12A12 12 0 0 1 10.12 58V32A12 12 0 0 1 22.12 20Z');
  });

  test('a bubble too short for its corners has them as the browser draws them: smaller together', () => {
    // * a line of a small text: shorter than its two big corners on a side
    const style = {borderTopLeftRadius: '15px', borderTopRightRadius: '6px', borderBottomRightRadius: '6px', borderBottomLeftRadius: '15px'} as CSSStyleDeclaration;
    const shape = {left: 0, top: 0, width: 120, height: 24, radii: getRadii(style, {width: 120, height: 24})};
    expect(shape.radii.topLeft + shape.radii.bottomLeft).toBeCloseTo(24);
    const path = makeOutgoingGradientPath([shape]);
    // * its left side's arcs meet and do not cross: each ends where the other starts, at the middle
    expect(path).toContain('A12 12 0 0 1 0 12V12A12 12');
  });

  test('nothing to cut out is no path', () => {
    expect(makeOutgoingGradientPath([])).toBe('');
  });
});
