import clamp from '@helpers/number/clamp';

// * smoothstep, 3t² - 2t³, of a value clamped to [0, 1]: a step that starts and ends at rest
export default function smoothstep01(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}
