/**
 * A wallpaper pattern made for a gift theme marks where the gift's symbol goes: a hidden
 * `<g id="GiftPatterns">` holding one `<rect>` per slot, rotated about its centre.
 */
export type GiftPatternSymbol = {
  // * fractions of the pattern tile
  x: number,
  y: number,
  width: number,
  height: number,
  // * degrees, clockwise
  rotation: number
};

const GROUP_REGEXP = /<g\b[^>]*\bid="GiftPatterns"[^>]*>([\s\S]*?)<\/g>/;
const RECT_REGEXP = /<rect\b[^>]*>/g;
const VIEW_BOX_REGEXP = /<svg\b[^>]*\bviewBox="([^"]+)"/;

function readNumberAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\s${name}="([^"]+)"`));
  return match ? +match[1] : NaN;
}

export function parseGiftPatternSymbols(svg: string): GiftPatternSymbol[] {
  const group = svg.match(GROUP_REGEXP);
  const viewBox = svg.match(VIEW_BOX_REGEXP)?.[1].trim().split(/[\s,]+/).map(Number);
  if(!group || viewBox?.length !== 4) {
    return [];
  }

  const [, , viewBoxWidth, viewBoxHeight] = viewBox;
  if(!(viewBoxWidth > 0) || !(viewBoxHeight > 0)) {
    return [];
  }

  const symbols: GiftPatternSymbol[] = [];
  for(const [tag] of group[1].matchAll(RECT_REGEXP)) {
    const x = readNumberAttribute(tag, 'x') || 0;
    const y = readNumberAttribute(tag, 'y') || 0;
    const width = readNumberAttribute(tag, 'width');
    const height = readNumberAttribute(tag, 'height');
    if(!(width > 0) || !(height > 0)) {
      continue;
    }

    // * the translate() before it is how the editor turns about the centre — the centre is kept as is
    const rotation = +(tag.match(/rotate\(\s*(-?[\d.]+)/)?.[1] ?? 0) || 0;
    symbols.push({
      x: x / viewBoxWidth,
      y: y / viewBoxHeight,
      width: width / viewBoxWidth,
      height: height / viewBoxHeight,
      rotation
    });
  }

  return symbols;
}

/**
 * The slot the gift itself takes: the biggest one nearest the middle of the tile, as tdesktop
 * picks it.
 */
export function chooseGiftSymbolIndex(symbols: GiftPatternSymbol[]) {
  let index = -1, best = 0;
  symbols.forEach((symbol, i) => {
    const centerX = symbol.x + symbol.width / 2;
    const centerY = symbol.y + symbol.height / 2;
    const value = Math.min(centerX, 1 - centerX) *
      Math.min(centerY, 1 - centerY) *
      Math.min(symbol.width, symbol.height);
    if(index === -1 || value > best) {
      index = i;
      best = value;
    }
  });

  return index;
}
