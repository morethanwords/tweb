export default function replaceNonLatin(str: string) {
  return str.replace(/[^A-Za-z0-9]/g, '');
}
