import BezierEasing from '@vendor/bezierEasing';

// a leaf module so that workers can use it too (@helpers/animateValue pulls in
// a main-thread-only import chain)
export const simpleEasing = BezierEasing(0.25, 0.1, 0.25, 1);
