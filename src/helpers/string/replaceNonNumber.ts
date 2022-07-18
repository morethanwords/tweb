export default function replaceNonNumber(str: string) {
  return str.replace(/\D/g, '');
}
