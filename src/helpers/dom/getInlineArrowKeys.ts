import isDocumentRTL from '@helpers/dom/isDocumentRTL';

/**
 * The arrow keys along the line: `next` points to the inline end — ArrowRight left to right,
 * ArrowLeft right to left — and `previous` to the inline start. Pass `rtl` for a widget whose own
 * direction may differ from the document's (a left-to-right island).
 */
export default function getInlineArrowKeys(rtl = isDocumentRTL()) {
  return rtl ?
    {next: 'ArrowLeft', previous: 'ArrowRight'} as const :
    {next: 'ArrowRight', previous: 'ArrowLeft'} as const;
}
