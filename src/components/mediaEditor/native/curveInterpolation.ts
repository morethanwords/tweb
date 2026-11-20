import type {CurveLevels} from '@components/mediaEditor/adjustments';

// Android 21f7d109 PhotoFilterView.java:217–224. Preserve Java float
// evaluation order for BOTH the plotted coordinates and the rendered LUT.
export function createNativeCurveSegment(a: number, b: number, c: number, d: number) {
  const f = Math.fround;
  const quadratic = f(f(f(2 * a) - f(5 * b)) + f(4 * c)) - d;
  const cubic = f(f(f(3 * b) - a) - f(3 * c)) + d;
  return (i: number) => {
    const t = f(i * f(1 / 100));
    const tt = f(t * t);
    const ttt = f(tt * t);
    const sum = f(f(f(f(2 * b) + f(f(c - a) * t)) + f(f(quadratic) * tt)) + f(f(cubic) * ttt));
    return f(0.5 * sum);
  };
}

// PhotoFilterView.java:188–249, drawn by PhotoFilterCurvesControl.java:309–320.
// The graph interpolates X too: the endpoint tangents use -.001 and 1.001.
// This is not the LUT's 200-sample domain or the legacy uniform-X graph.
export function createNativeCurvePlot(levels: CurveLevels): [number, number][] {
  const f = Math.fround;
  const xs = [-0.001, 0, 0.25, 0.5, 0.75, 1, 1.001].map(f);
  const ys = [levels[0], ...levels, levels[4]].map(value => f(f(value) / 100));
  const points: [number, number][] = [[xs[0], ys[0]]];
  for(let segment = 1; segment < 5; ++segment) {
    const x = createNativeCurveSegment(xs[segment - 1], xs[segment], xs[segment + 1], xs[segment + 2]);
    const y = createNativeCurveSegment(ys[segment - 1], ys[segment], ys[segment + 1], ys[segment + 2]);
    for(let i = 1; i < 100; ++i) {
      const px = x(i);
      if(px > xs[segment - 1]) points.push([px, Math.max(0, Math.min(1, y(i)))]);
    }
    points.push([xs[segment + 1], ys[segment + 1]]);
  }
  points.push([xs[6], ys[6]]);
  return points;
}
