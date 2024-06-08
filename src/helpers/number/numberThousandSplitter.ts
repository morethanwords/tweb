export default function numberThousandSplitter(x: number, joiner = ' ') {
  if(x === undefined) return '';
  const parts = x.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, joiner);
  return parts.join('.');
}

export function numberThousandSplitterForWatching(x: number) {
  if(x === undefined) return '';
  return numberThousandSplitter(x, ',');
}
