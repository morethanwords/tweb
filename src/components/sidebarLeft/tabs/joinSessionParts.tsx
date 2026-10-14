import I18n, {joinElementsWith} from '@lib/langPack';

/**
 * The parts of a session's line (device and system, IP address and country) joined into one, each
 * isolated in its own direction: a device named in Arabic does not reorder the rest, and an IP
 * address — passed as `{ltr}` — always reads left to right. The parts follow one another in the
 * layout's direction, which the line states itself: inside a `dir="auto"` row part made of
 * nothing but isolates, the text would otherwise fall back to left to right.
 */
export function joinSessionParts(parts: (string | {ltr: string} | undefined)[], separator: string) {
  return (
    <span dir={I18n.isRTL() ? 'rtl' : 'ltr'}>
      {/* * a part the server left out (a connected bot's device or location) is skipped */}
      {joinElementsWith(parts.filter((part) => typeof(part) === 'string' ? part : part?.ltr).map((part) => {
        const isLtr = typeof(part) !== 'string';
        const text = isLtr ? part.ltr : part;
        return <span dir={isLtr ? 'ltr' : 'auto'}>{text}</span>;
      }), separator)}
    </span>
  );
}
