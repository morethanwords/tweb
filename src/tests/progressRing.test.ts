import {
  createProgressRing,
  getProgressRingCircumference,
  getProgressRingRadius
} from '@components/progressRing';

describe('createProgressRing', () => {
  test('resizes its geometry while preserving progress', () => {
    const ring = createProgressRing({size: 280, progress: 0.25});

    const initialRadius = getProgressRingRadius(280);
    const initialCircumference = getProgressRingCircumference(280);
    expect(ring.element.getAttribute('width')).toBe('280');
    expect(ring.circle.getAttribute('cx')).toBe('140');
    expect(ring.circle.getAttribute('r')).toBe('' + initialRadius);
    expect(parseFloat(ring.circle.style.strokeDashoffset)).toBeCloseTo(initialCircumference * 0.75);

    ring.setSize(240);

    const resizedRadius = getProgressRingRadius(240);
    const resizedCircumference = getProgressRingCircumference(240);
    expect(ring.element.getAttribute('width')).toBe('240');
    expect(ring.element.getAttribute('height')).toBe('240');
    expect(ring.circle.getAttribute('cx')).toBe('120');
    expect(ring.circle.getAttribute('cy')).toBe('120');
    expect(ring.circle.getAttribute('r')).toBe('' + resizedRadius);
    expect(parseFloat(ring.circle.style.strokeDasharray)).toBeCloseTo(resizedCircumference);
    expect(parseFloat(ring.circle.style.strokeDashoffset)).toBeCloseTo(resizedCircumference * 0.75);

    ring.destroy();
  });
});
