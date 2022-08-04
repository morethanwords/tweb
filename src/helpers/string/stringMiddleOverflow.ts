export default function stringMiddleOverflow(str: string, maxLength: number) {
  return str.length > maxLength ? str.slice(0, maxLength / 2 | 0) + '...' + str.slice(-Math.round(maxLength / 2)) : str;
}
