export default function numberThousandSplitter(x: number, joiner = ' ') {
  const parts = x.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, joiner);
  return parts.join('.');
}
