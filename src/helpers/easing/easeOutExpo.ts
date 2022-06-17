// https://spicyyoghurt.com/tools/easing-functions
export default function easeOutExpo(t: number, b: number, c: number, d: number) {
  return t >= d ? b + c : c * (-Math.pow(2, -10 * t / d) + 1) + b;
}
