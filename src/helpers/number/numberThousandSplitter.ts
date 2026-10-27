// * a no-break space: a plain one is a word break to the bidi algorithm, and in right-to-left text
// * "10 000" would come apart into "000 10"; this one joins the digits (bidi class CS) and the line
// * cannot wrap between them either
const THOUSANDS_SPACE = '\u00A0';

export default function numberThousandSplitter(x: number | string, joiner = THOUSANDS_SPACE) {
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
  return numberThousandSplitter(x, THOUSANDS_SPACE);
}
