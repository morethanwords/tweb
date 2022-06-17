// just for the future
export default function buildURLHash(str: string) {
  return '#' + encodeURIComponent(str);
}
