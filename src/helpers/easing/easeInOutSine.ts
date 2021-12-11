// https://spicyyoghurt.com/tools/easing-functions
export default function easeInOutSine (t: number, b: number, c: number, d: number) {
  return -c / 2 * (Math.cos(Math.PI * t / d) - 1) + b;
}
