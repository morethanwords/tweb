import {splitGraphemes} from '@lib/richTextProcessor/graphemes';

const MAX_GLYPHS = 2000;

export default function drawGlyphMask(
  messageElement: HTMLElement,
  parentRect: DOMRect,
  width: number,
  height: number,
  dpr: number
) {
  if(typeof(OffscreenCanvas) === 'undefined' || !width || !height) return;

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  context.scale(dpr, dpr);
  context.fillStyle = '#fff';
  context.textBaseline = 'alphabetic';
  // * left is the left edge in either direction: a piece of text is put where the page has its box
  context.textAlign = 'left';

  const range = document.createRange();
  let drawn = 0;

  for(const spoiler of messageElement.querySelectorAll('.spoiler-text')) {
    const walker = document.createTreeWalker(spoiler, NodeFilter.SHOW_TEXT);
    for(let node = walker.nextNode() as Text; node; node = walker.nextNode() as Text) {
      const text = node.data;
      const style = getComputedStyle(node.parentElement);
      context.font = style.font || (style.fontSize + ' ' + style.fontFamily);
      context.direction = style.direction === 'rtl' ? 'rtl' : 'ltr';
      const metrics = context.measureText(text.trim()[0] || 'M');
      const ascent = metrics.fontBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent;

      // * the piece of text from `start` to `end` where the page has it, when it stands in one box
      const drawPiece = (piece: string, start: number, end: number) => {
        range.setStart(node, start);
        range.setEnd(node, end);
        const rects = range.getClientRects();
        if(rects.length !== 1 || !rects[0].width) return false;

        const rect = rects[0];
        const baseline = rect.top + (rect.height - ascent - descent) / 2 + ascent;
        context.fillText(piece, rect.left - parentRect.left, baseline - parentRect.top);
        return true;
      };

      // * a word at once, shaped as the page shapes it (joined Arabic, Indic clusters); one the line breaks, or one
      // * of more than one box, grapheme by grapheme, never splitting one
      for(const match of text.matchAll(/\S+/g)) {
        if(++drawn > MAX_GLYPHS) return canvas.transferToImageBitmap();
        const word = match[0];
        if(drawPiece(word, match.index, match.index + word.length)) continue;

        let offset = match.index;
        for(const grapheme of splitGraphemes(word)) {
          drawPiece(grapheme, offset, offset + grapheme.length);
          offset += grapheme.length;
        }
      }
    }
  }

  return canvas.transferToImageBitmap();
}
