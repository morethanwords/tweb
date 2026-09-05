import {MATH_MARKER_RE, STX} from '@helpers/math/mathMarker';

export type GraphemeSegment = {
  segment: string,
  index: number
};

type SegmenterLike = {
  segment: (text: string) => Iterable<GraphemeSegment>
};

type SegmenterConstructor = new(
  locales?: string | string[],
  options?: {granularity: 'grapheme'}
) => SegmenterLike;

const createSegmenter = (): SegmenterLike | undefined => {
  const Segmenter = (Intl as typeof Intl & {Segmenter?: SegmenterConstructor}).Segmenter;
  if(!Segmenter) return;

  try {
    return new Segmenter(undefined, {granularity: 'grapheme'});
  } catch{
    return;
  }
};

const segmenter = createSegmenter();
const MARK = (() => {
  try {
    return new RegExp('\\p{Mark}', 'u');
  } catch{
    return undefined;
  }
})();

const codePoint = (value?: string) => value?.codePointAt(0);
const isRegionalIndicator = (value?: string) => {
  const point = codePoint(value);
  return point >= 0x1F1E6 && point <= 0x1F1FF;
};
const isEmojiModifier = (value: string) => {
  const point = codePoint(value);
  return point >= 0x1F3FB && point <= 0x1F3FF;
};
const isVariationSelector = (value: string) => {
  const point = codePoint(value);
  return (point >= 0xFE00 && point <= 0xFE0F) || (point >= 0xE0100 && point <= 0xE01EF);
};
const isEmojiTag = (value: string) => {
  const point = codePoint(value);
  return point >= 0xE0020 && point <= 0xE007F;
};
const isMark = (value: string) => MARK ?
  MARK.test(value) :
  /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/.test(value);
const isAttached = (value: string) => isMark(value) ||
  isVariationSelector(value) ||
  isEmojiModifier(value) ||
  isEmojiTag(value);

/**
 * A compact fallback for runtimes without `Intl.Segmenter`. `Array.from`
 * keeps surrogate pairs intact; the remaining rules cover the clusters that
 * occur most often in message text: combining marks, emoji modifiers,
 * regional-indicator pairs, emoji tags and chained ZWJ sequences.
 */
function splitGraphemesFallbackPlain(text: string): string[] {
  const points = Array.from(text);
  const result: string[] = [];

  for(let i = 0; i < points.length; ++i) {
    let current = points[i];

    if(current === '\r' && points[i + 1] === '\n') {
      current += points[++i];
    } else if(isRegionalIndicator(current) && isRegionalIndicator(points[i + 1])) {
      current += points[++i];
    }

    while(i + 1 < points.length) {
      const next = points[i + 1];
      if(isAttached(next)) {
        current += next;
        ++i;
        continue;
      }

      if(next === '\u200d' && i + 2 < points.length) {
        current += next + points[i + 2];
        i += 2;
        continue;
      }

      break;
    }

    result.push(current);
  }

  return result;
}

const splitMathMarkers = (text: string, splitPlain: (text: string) => string[]) => {
  const result: string[] = [];
  const marker = new RegExp(MATH_MARKER_RE.source, MATH_MARKER_RE.flags);
  let offset = 0;
  let match: RegExpExecArray;
  while((match = marker.exec(text))) {
    if(match.index > offset) result.push(...splitPlain(text.slice(offset, match.index)));
    result.push(match[0]);
    offset = match.index + match[0].length;
  }
  if(offset < text.length) {
    result.push(...splitPlain(text.slice(offset)));
  }
  return result;
};

export function splitGraphemesFallback(text: string): string[] {
  return splitMathMarkers(text, splitGraphemesFallbackPlain);
}

const MATH_MARKER_PAYLOAD_RE = /^[A-Za-z0-9+/=]$/;

/**
 * Index of the grapheme opening an unterminated inline-math marker, or -1.
 *
 * `splitMathMarkers` groups only COMPLETE markers, so while one is still streaming its
 * opening sentinel and payload sit in the array as separate single-character tokens. The
 * append fast paths below rescan the final cluster, which cannot reach back to that
 * sentinel — so without this the finished marker never coalesces and reveals as raw base64.
 */
function getPendingMathMarkerIndex(length: number, getGrapheme: (index: number) => string) {
  for(let index = length - 1; index >= 0; --index) {
    const grapheme = getGrapheme(index);
    // A complete marker is one multi-character token, so it stops the walk like any
    // other non-payload grapheme.
    if(grapheme === STX) return index;
    if(!MATH_MARKER_PAYLOAD_RE.test(grapheme)) return -1;
  }
  return -1;
}

/** Only a closing sentinel inside the appended text can complete a pending marker. */
function appendCanCompleteMathMarker(previousText: string, text: string) {
  return text.indexOf(STX, previousText.length) !== -1;
}

function splitGraphemesPlain(text: string): string[] {
  if(!text) return [];
  if(!segmenter) return splitGraphemesFallbackPlain(text);
  return Array.from(segmenter.segment(text), ({segment}) => segment);
}

/** Complete inline-math markers are one reveal token, never visible as raw base64. */
export function splitGraphemes(text: string): string[] {
  return splitMathMarkers(text, splitGraphemesPlain);
}

/** Sorted UTF-16 indices of every grapheme boundary, including both ends. */
export function getGraphemeOffsets(text: string): number[] {
  const offsets = [0];
  let offset = 0;
  for(const grapheme of splitGraphemes(text)) {
    offset += grapheme.length;
    offsets.push(offset);
  }
  return offsets;
}

/**
 * Re-segments only the previous tail cluster when text is appended. A new
 * code point can change the final cluster (ZWJ, combining mark, RI, CRLF), but
 * cannot affect a completed cluster before it.
 */
export function updateGraphemes(
  previousText: string,
  previousGraphemes: string[],
  text: string,
  append = text.startsWith(previousText),
  details?: {changedFrom: number}
): string[] {
  if(text === previousText) {
    if(details) details.changedFrom = previousGraphemes.length;
    return previousGraphemes;
  }
  if(!previousText || !append || !previousGraphemes.length) {
    const graphemes = splitGraphemes(text);
    if(details) details.changedFrom = getCommonGraphemePrefixLength(previousGraphemes, graphemes);
    return graphemes;
  }

  const pendingIndex = appendCanCompleteMathMarker(previousText, text) ?
    getPendingMathMarkerIndex(previousGraphemes.length, (index) => previousGraphemes[index]) :
    -1;
  const rescanIndex = pendingIndex === -1 ? previousGraphemes.length - 1 : pendingIndex;
  let rescanFrom = previousText.length;
  for(let index = previousGraphemes.length - 1; index >= rescanIndex; --index) {
    rescanFrom -= previousGraphemes[index].length;
  }
  const nextTail = splitGraphemes(text.slice(rescanFrom));
  const tailCommonPrefix = getCommonGraphemePrefixLength(
    previousGraphemes.slice(rescanIndex),
    nextTail
  );
  previousGraphemes.splice(
    rescanIndex,
    previousGraphemes.length - rescanIndex,
    ...nextTail
  );
  if(details) details.changedFrom = rescanIndex + tailCommonPrefix;
  return previousGraphemes;
}

/** Incremental counterpart of `getGraphemeOffsets` for append-only updates. */
export function updateGraphemeOffsets(
  previousText: string,
  previousOffsets: number[],
  text: string,
  append = text.startsWith(previousText)
): number[] {
  if(text === previousText) return previousOffsets;
  if(!previousText || !append || previousOffsets.length < 2) {
    return getGraphemeOffsets(text);
  }

  const pendingIndex = appendCanCompleteMathMarker(previousText, text) ?
    getPendingMathMarkerIndex(
      previousOffsets.length - 1,
      (index) => previousText.slice(previousOffsets[index], previousOffsets[index + 1])
    ) :
    -1;
  const rescanIndex = pendingIndex === -1 ? previousOffsets.length - 2 : pendingIndex;
  const rescanFrom = previousOffsets[rescanIndex];
  const tail = getGraphemeOffsets(text.slice(rescanFrom));
  previousOffsets.length = rescanIndex + 1;
  for(let index = 1; index < tail.length; ++index) {
    previousOffsets.push(rescanFrom + tail[index]);
  }
  return previousOffsets;
}

/** Smallest grapheme boundary greater than or equal to `offset`. */
export function snapGraphemeOffsetUp(offsets: readonly number[], offset: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while(low < high) {
    const middle = (low + high) >>> 1;
    if(offsets[middle] < offset) low = middle + 1;
    else high = middle;
  }
  return offsets[low];
}

/** Largest grapheme boundary less than or equal to `offset`. */
export function snapGraphemeOffsetDown(offsets: readonly number[], offset: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while(low < high) {
    const middle = (low + high + 1) >>> 1;
    if(offsets[middle] > offset) high = middle - 1;
    else low = middle;
  }
  return offsets[low];
}

export function getCommonGraphemePrefixLength(left: readonly string[], right: readonly string[]) {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while(index < length && left[index] === right[index]) ++index;
  return index;
}
