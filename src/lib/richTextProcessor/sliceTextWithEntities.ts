import type {MessageEntity} from '@layer';
import {
  getGraphemeOffsets,
  snapGraphemeOffsetDown,
  snapGraphemeOffsetUp
} from '@lib/richTextProcessor/graphemes';

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
  'messageEntityPre',
  'messageEntityTimestamp',
  'messageEntityFormattedDate',
  'messageEntityAnchor',
  'messageEntityDiffReplace'
]);

const ZERO_LENGTH: ReadonlySet<MessageEntity['_']> = new Set([
  'messageEntityLinebreak',
  'messageEntityCaret'
]);

export const isAtomicTextEntity = (entity: MessageEntity) => ATOMIC.has(entity._);

/**
 * Entity-aware slice for offsets that are already known grapheme boundaries.
 * Prefer `sliceTextWithEntities` for arbitrary offsets.
 */
export function sliceTextWithEntitiesAtGraphemeBoundaries(
  text: string,
  entities: MessageEntity[],
  from: number,
  to: number
): {text: string, entities: MessageEntity[], from: number, to: number} {
  const start = Math.max(0, Math.min(from, text.length));
  let end = Math.max(0, Math.min(to, text.length));
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

  const boundaries = getGraphemeOffsets(text);
  const start = snapGraphemeOffsetUp(boundaries, from);
  let end = snapGraphemeOffsetDown(boundaries, to);
  if(end < start) end = start;

  return sliceTextWithEntitiesAtGraphemeBoundaries(text, entities, start, end);
}
