export default function numberThousandSplitter(x: number | string, joiner = ' ') {
  if(x === undefined) return '';
  const parts = x.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, joiner);
  return parts.join('.');
}

export function numberThousandSplitterForWatching(x: number | string) {
  if(x === undefined) return '';
  return numberThousandSplitter(x, ',');
}

export function numberThousandSplitterForStars(x: number | string) {
  if(x === undefined) return '';
  return numberThousandSplitter(x, ',');
}
