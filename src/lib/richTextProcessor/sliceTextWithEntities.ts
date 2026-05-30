import type {MessageEntity} from '@layer';

const ATOMIC: ReadonlySet<MessageEntity['_']> = new Set([
  'messageEntityMention',
  'messageEntityMentionName',
  'inputMessageEntityMentionName',
  'messageEntityHashtag',
  'messageEntityCashtag',
  'messageEntityBotCommand',
  'messageEntityUrl',
  'messageEntityTextUrl',
  'messageEntityEmail',
  'messageEntityPhone',
  'messageEntityBankCard',
  'messageEntityCustomEmoji',
  'messageEntityEmoji',
  'messageEntityImage',
  'messageEntityTimestamp',
  'messageEntityFormattedDate',
  'messageEntityAnchor',
  'messageEntityDiffReplace'
]);

const ZERO_LENGTH: ReadonlySet<MessageEntity['_']> = new Set([
  'messageEntityLinebreak',
  'messageEntityCaret'
]);

/** Sorted UTF-16 indices of every grapheme boundary, including 0 and text.length. */
function graphemeBoundaries(text: string): number[] {
  const seg = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
  const out: number[] = [];
  for(const {index} of seg.segment(text)) out.push(index);
  out.push(text.length);
  return out;
}

/** Smallest boundary >= i. */
function snapUp(boundaries: number[], i: number): number {
  let lo = 0, hi = boundaries.length - 1;
  while(lo < hi) {
    const mid = (lo + hi) >>> 1;
    if(boundaries[mid] < i) lo = mid + 1;
    else hi = mid;
  }
  return boundaries[lo];
}

/** Largest boundary <= i. */
function snapDown(boundaries: number[], i: number): number {
  let lo = 0, hi = boundaries.length - 1;
  while(lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if(boundaries[mid] > i) hi = mid - 1;
    else lo = mid;
  }
  return boundaries[lo];
}

/**
 * Slices `text` over the UTF-16 range `[from, to)` while preserving entity
 * integrity. Boundaries are snapped inward to the nearest grapheme cluster so
 * surrogate pairs and emoji sequences are never split. Entities are clipped
 * to the resulting range; atomic entities (mentions, links, custom emoji,
 * etc.) are dropped if a boundary falls inside them. Returns the sliced text,
 * the adjusted entities, and the actual `from`/`to` used after snapping.
 */
export function sliceTextWithEntities(
  text: string,
  entities: MessageEntity[],
  from: number,
  to: number
): {text: string, entities: MessageEntity[], from: number, to: number} {
  from = Math.max(0, Math.min(from, text.length));
  to = Math.max(0, Math.min(to, text.length));
  if(to < from) to = from;

  const boundaries = graphemeBoundaries(text);
  const start = snapUp(boundaries, from);
  let end = snapDown(boundaries, to);
  if(end < start) end = start;

  const slicedText = text.slice(start, end);

  const out: MessageEntity[] = [];
  for(const e of entities) {
    const eStart = e.offset ?? 0;
    const eLen = e.length ?? 0;
    const eEnd = eStart + eLen;

    if(ZERO_LENGTH.has(e._)) {
      if(eStart >= start && eStart <= end) {
        out.push({...e, offset: eStart - start, length: 0});
      }
      continue;
    }

    if(eEnd <= start || eStart >= end) continue;

    const fullyInside = eStart >= start && eEnd <= end;
    if(!fullyInside && ATOMIC.has(e._)) continue;

    const newStart = Math.max(eStart, start);
    const newEnd = Math.min(eEnd, end);
    out.push({...e, offset: newStart - start, length: newEnd - newStart});
  }

  return {text: slicedText, entities: out, from: start, to: end};
}
