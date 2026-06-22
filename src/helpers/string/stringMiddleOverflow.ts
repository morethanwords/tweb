export default function stringMiddleOverflow(str: string, maxLength: number) {
  if(str.length <= maxLength) {
    return str;
  }

  const ellipsis = '...';
  const budget = Math.max(0, maxLength - ellipsis.length);
  const headLength = budget - (budget >> 1); // ceil(budget / 2)
  const tailLength = budget >> 1; // floor(budget / 2)
  return str.slice(0, headLength) + ellipsis + (tailLength ? str.slice(-tailLength) : '');
}
