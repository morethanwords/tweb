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
  context.textAlign = 'left';

  const range = document.createRange();
  let drawn = 0;

  for(const spoiler of messageElement.querySelectorAll('.spoiler-text')) {
    const walker = document.createTreeWalker(spoiler, NodeFilter.SHOW_TEXT);
    for(let node = walker.nextNode() as Text; node; node = walker.nextNode() as Text) {
      const text = node.data;
      const style = getComputedStyle(node.parentElement);
      context.font = style.font || (style.fontSize + ' ' + style.fontFamily);
      const metrics = context.measureText(text.trim()[0] || 'M');
      const ascent = metrics.fontBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent;

      for(let index = 0; index < text.length; ++index) {
        const char = text[index];
        if(!char.trim()) continue;
        if(++drawn > MAX_GLYPHS) return canvas.transferToImageBitmap();

        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getClientRects()[0];
        if(!rect || !rect.width) continue;

        const baseline = rect.top + (rect.height - ascent - descent) / 2 + ascent;
        context.fillText(char, rect.left - parentRect.left, baseline - parentRect.top);
      }
    }
  }

  return canvas.transferToImageBitmap();
}
