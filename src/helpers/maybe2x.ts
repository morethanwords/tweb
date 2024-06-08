export default function maybe2x(str: string) {
  return str + (window.devicePixelRatio > 1 ? '@2x' : '');
}
