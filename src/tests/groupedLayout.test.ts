import {Layouter} from '@components/groupedLayout';

function getLayoutHeight(layout: ReturnType<Layouter['layout']>) {
  return Math.max(...layout.map(({geometry}) => geometry.y + geometry.height));
}

describe('grouped media layout', () => {
  test('preserves the natural two-item height below the maximum', () => {
    const layout = new Layouter(
      [{w: 800, h: 1200}, {w: 1600, h: 900}],
      696,
      174,
      2,
      360
    ).layout();

    expect(getLayoutHeight(layout)).toBeLessThan(360);
  });

  test('honors an explicit maximum height for complex collages', () => {
    const layout = new Layouter(
      Array.from({length: 5}, () => ({w: 800, h: 1200})),
      696,
      174,
      2,
      360
    ).layout();

    expect(getLayoutHeight(layout)).toBeLessThanOrEqual(360);
  });

  test('honors an explicit maximum height for panoramic complex layouts', () => {
    const layout = new Layouter(
      [{w: 2400, h: 600}, {w: 800, h: 1200}],
      696,
      174,
      2,
      360
    ).layout();

    expect(getLayoutHeight(layout)).toBeLessThanOrEqual(360);
  });
});
