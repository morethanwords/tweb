import {FontFamily, FontWeightBold} from '@config/font';
import getTextWidth from '@helpers/canvas/getTextWidth';
import {CAPTION_LINE_HEIGHT, CAPTION_MAX_LINES, CardGeometry} from './layout';

/**
 * The text under the code, as `QrShareView.nameLayout` sets it: the largest of three sizes that fits on one line,
 * else the smallest on two lines of an even width, else on three. The screen and the exported picture lay it out
 * through here, so both break it in the same places.
 */

export type CaptionLayout = {
  fontSize: number,
  lines: string[]
};

export type MeasureText = (text: string, fontSize: number) => number;

/** Greedy words into lines no wider than `width`; a word wider than that is cut by letters */
function breakLines(text: string, fontSize: number, width: number, measure: MeasureText) {
  const lines: string[] = [];
  let line = '';
  const push = (next: string) => {
    if(measure(next, fontSize) <= width || !line) {
      line = next;
      return;
    }

    lines.push(line);
    line = next;
  };

  for(const word of text.split(/\s+/).filter(Boolean)) {
    const withWord = line ? line + ' ' + word : word;
    if(measure(withWord, fontSize) <= width) {
      line = withWord;
      continue;
    }

    if(line) {
      lines.push(line);
      line = '';
    }

    // a word wider than the line
    let rest = word;
    while(measure(rest, fontSize) > width && rest.length > 1) {
      let fit = rest.length - 1;
      while(fit > 1 && measure(rest.slice(0, fit), fontSize) > width) --fit;
      lines.push(rest.slice(0, fit));
      rest = rest.slice(fit);
    }

    push(rest);
  }

  if(line) lines.push(line);
  return lines;
}

function ellipsize(text: string, fontSize: number, width: number, measure: MeasureText) {
  if(measure(text, fontSize) <= width) return text;
  let end = text.length;
  while(end > 0 && measure(text.slice(0, end) + '…', fontSize) > width) --end;
  return text.slice(0, end) + '…';
}

/**
 * @param text what is written, already in capitals
 * @param width the room for a line
 * @param fonts the sizes, from the largest
 */
export function layoutCaption(text: string, width: number, fonts: number[], measure: MeasureText): CaptionLayout {
  for(let i = 0; i < fonts.length; ++i) {
    const fontSize = fonts[i];
    const full = measure(text, fontSize);
    const last = i === fonts.length - 1;
    if(!last && full > width) continue;
    if(full <= width) return {fontSize, lines: [text]};

    // the smallest size: two lines of an even width, three when two do not do
    let lineWidth = full / 2 + 2;
    let max = 2;
    if(lineWidth > width) {
      lineWidth = full / 3 + 4;
      max = CAPTION_MAX_LINES;
    }

    lineWidth = Math.min(lineWidth, width);
    let lines = breakLines(text, fontSize, lineWidth, measure);
    if(lines.length > max) {
      // the same text in the whole width, then cut
      lines = breakLines(text, fontSize, width, measure);
      if(lines.length > max) {
        lines = lines.slice(0, max);
        lines[max - 1] = ellipsize(lines[max - 1] + '…', fontSize, width, measure);
      }
    }

    return {fontSize, lines};
  }
}

export const captionFont = (fontSize: number) => `${FontWeightBold} ${fontSize}px ${FontFamily}`;

/** The width of text in the caption's font */
export const measureCaptionText: MeasureText = (text, fontSize) => getTextWidth(text, captionFont(fontSize));

export type Caption = {
  /** Already in capitals */
  text: string,
  /** A username and a phone number read left to right in any language; a name takes its own direction */
  kind: 'username' | 'phone' | 'name'
};

/** Where the caption's lines go inside the card: its size, the lines and the top of the first, from the card's top */
export function captionPlacement(geometry: CardGeometry, caption: Caption | undefined) {
  if(!caption) return;
  const {fontSize, lines} = layoutCaption(caption.text, geometry.captionWidth, geometry.captionFonts, measureCaptionText);
  const height = lines.length * fontSize * CAPTION_LINE_HEIGHT;
  // centred in the room under the code, a little above the middle (Android raises it 4 dp)
  const top = geometry.captionTop + (geometry.captionHeight - height) / 2 - geometry.width * 4 / 268;
  return {fontSize, lines, top, lineHeight: fontSize * CAPTION_LINE_HEIGHT};
}
