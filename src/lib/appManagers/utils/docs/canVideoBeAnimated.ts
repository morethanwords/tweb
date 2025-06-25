export default function canVideoBeAnimated(noSound: boolean, size: number) {
  return noSound &&
    size > (10 * 1024) &&
    size < (10 * 1024 * 1024);
}
