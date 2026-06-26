import BezierEasing from '@vendor/bezierEasing';

// a leaf module so that workers can use these too (@helpers/animateValue and the
// spoiler-overlay utils pull in main-thread-only import chains)
export const defaultEasing = BezierEasing(0.42, 0.0, 0.58, 1.0);
export const simpleEasing = BezierEasing(0.25, 0.1, 0.25, 1);
export const unwrapEasing = BezierEasing(0.45, 0.37, 0.29, 1);
