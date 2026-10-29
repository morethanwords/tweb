import {ColorRgb, darkenToMaxLuminance, ensureTextContrast, getContrastRatio, getHexColorFromTelegramColor, hexToRgb, mixColors, relativeLuminance, rgbaToHexa} from '@helpers/color';
import clamp from '@helpers/number/clamp';

// * the outgoing bubbles' fill when the theme gives them more than one colour: a vertical gradient over the chat's
// * frame (`.bubbles`), of which every bubble shows the part it stands over, as on Android, iOS and Desktop
// * (`message-out-gradient` in _chatBubble.scss). Properties of the element the theme is applied on, so a chat's theme
// * covers the app's, `none` included: the gradient, and the picture of it the bubbles are filled with
export const MESSAGE_OUT_GRADIENT_PROPERTY = '--message-out-gradient';
export const MESSAGE_OUT_GRADIENT_IMAGE_PROPERTY = '--message-out-gradient-image';

// * the picture is a column a pixel wide, which every part of a bubble stretches across: the compositor draws it from
// * that column, where a gradient as wide as the frame would be painted again in full for every part
const IMAGE_HEIGHT = 256;
const images = new Map<string, string>();

// * what the text is read on (WCAG's for text), and how far under it a moved colour may land, rounded to whole channels
const READABLE_CONTRAST = 4.5;
const ROUNDING = .05;
// * how many colours are put between two of the theme's, at first and at most: where they mix the text has to be read
// * too, and a mix of two colours can be darker or lighter than both
const STEPS_BETWEEN = 4;
const MAX_STEPS_BETWEEN = 32;

/**
 * The gradient's colours for the theme's ones under the outgoing text of this colour: from the bottom up, evenly
 * spaced; nothing for one colour. Each is moved as far from the text as it takes to read it - darker under white text,
 * as on Desktop, lighter under dark text - and more are put between the theme's until every mix of two that stand
 * side by side reads as well
 */
export function getOutgoingMessageGradientColors(colors: number[] | undefined, textColor: ColorRgb): ColorRgb[] | undefined {
  const hexes = (colors || []).map(getHexColorFromTelegramColor);
  if(new Set(hexes).size < 2) {
    return;
  }

  const theme = hexes.map(hexToRgb);
  for(let steps = STEPS_BETWEEN; ; steps *= 2) {
    const gradient = theme.flatMap((color, index) => {
      const next = theme[index + 1];
      return Array.from({length: next ? steps : 1}, (_, step) => {
        const mixed = next ? mixColors(next, color, step / steps) : color;
        // * ensureTextContrast moves its first colour against the second, which is the text here
        return hexToRgb(ensureTextContrast(rgbaToHexa(mixed), textColor, READABLE_CONTRAST));
      });
    });

    const readable = getPainted(gradient).every((color) => getContrastRatio(color, textColor) >= READABLE_CONTRAST - ROUNDING);
    if(readable || steps >= MAX_STEPS_BETWEEN) {
      return gradient;
    }
  }
}

// * the colours the gradient is painted in: its own and the mixes of each two that stand side by side
function getPainted(colors: ColorRgb[]) {
  return colors.flatMap((color, index) => index ? [.25, .5, .75].map((t) => mixColors(color, colors[index - 1], t)).concat([color]) : [color]);
}

export function makeOutgoingMessageGradient(colors: ColorRgb[] | undefined) {
  // the first colour at the bottom, by the newest messages (Android)
  return colors ? `linear-gradient(to top, ${colors.map(rgbaToHexa).join(', ')})` : 'none';
}

export function makeOutgoingMessageGradientImage(colors: ColorRgb[] | undefined) {
  const hexes = colors?.map(rgbaToHexa);
  const key = hexes?.join();
  if(!key) {
    return 'none';
  }

  let image = images.get(key);
  if(!image) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = IMAGE_HEIGHT;
    const context = canvas.getContext('2d');
    if(!context) {
      return 'none';
    }

    const gradient = context.createLinearGradient(0, IMAGE_HEIGHT, 0, 0);
    hexes.forEach((hex, index) => gradient.addColorStop(index / (hexes.length - 1), hex));
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1, IMAGE_HEIGHT);
    images.set(key, image = `url("${canvas.toDataURL()}")`);
  }

  return image;
}

// * a colour of the bubbles' own under dark text (the time, the ticks, the links), darkened to be read all over their
// * gradient: the darkest it is painted in decides
export function keepReadableOnOutgoingMessageGradient(hex: string, colors: ColorRgb[]) {
  const darkest = Math.min(...getPainted(colors).map(relativeLuminance));
  return darkenToMaxLuminance(hex, (darkest + .05) / READABLE_CONTRAST - .05);
}

/**
 * The gradient the content of an outgoing bubble shows: its colours from the bottom up, and the box it spans (the
 * chat's frame). Nothing where the bubble is of one colour, which it is too where its piece is not drawn (no picture
 * of the gradient, no clip for a fixed piece)
 */
export function readOutgoingMessageGradient(content: Element): {colors: ColorRgb[], frame: DOMRect} | undefined {
  const frame = content.closest('.bubbles');
  const piece = frame && content.querySelector(':scope > .bubble-gradient');
  const drawn = piece && getComputedStyle(piece, '::before').backgroundImage !== 'none';
  const hexes = drawn && getComputedStyle(content).getPropertyValue(MESSAGE_OUT_GRADIENT_PROPERTY).match(/#[0-9a-f]{6}/gi);
  if(!hexes) {
    return;
  }

  return {colors: hexes.map(hexToRgb), frame: frame.getBoundingClientRect()};
}

/**
 * The pieces of the gradient are fixed to the frame, until a transform on what they are in (a bubble swiped or moved
 * aside by a change of another, its wrapper zoomed in by a ladder) takes them in, and they are laid out in that instead:
 * placed there where the frame is, against where the element is laid out (past a transform of its own, which may be on
 * already), they keep their colours while it lasts (`--message-out-gradient-held-top`, `-height`, which only the moving
 * states read). The reads are made now; what is returned writes
 */
export function measureOutgoingMessageGradientHold(elements: HTMLElement[]): VoidFunction | undefined {
  const held = elements.filter((element) => element.closest('.bubble.is-out'));
  const frame = held[0]?.closest('.bubbles');
  const image = frame && getComputedStyle(frame).getPropertyValue(MESSAGE_OUT_GRADIENT_IMAGE_PROPERTY).trim();
  if(!image || image === 'none') {
    return;
  }

  const frameRect = frame.getBoundingClientRect();
  const tops = held.map((element) => {
    const parent = element.offsetParent as HTMLElement;
    return parent.getBoundingClientRect().top + parent.clientTop + element.offsetTop;
  });
  return () => held.forEach((element, index) => {
    element.style.setProperty('--message-out-gradient-held-top', `${frameRect.top - tops[index]}px`);
    element.style.setProperty('--message-out-gradient-held-height', `${frameRect.height}px`);
  });
}

export function holdOutgoingMessageGradient(elements: HTMLElement[]) {
  measureOutgoingMessageGradientHold(elements)?.();
}

// * a move with no class of its own to be told by (a change's): the elements are marked while any of theirs lasts
const MESSAGE_OUT_GRADIENT_HELD_CLASS = 'is-gradient-held';
const heldBy = new WeakMap<HTMLElement, number>();

/** marks the elements as moved (a write); what is returned unmarks them, once the last of their moves is over */
export function markOutgoingMessageGradientHeld(elements: HTMLElement[]): VoidFunction {
  for(const element of elements) {
    heldBy.set(element, (heldBy.get(element) || 0) + 1);
    element.classList.add(MESSAGE_OUT_GRADIENT_HELD_CLASS);
  }

  return () => {
    for(const element of elements) {
      const count = heldBy.get(element) - 1;
      if(count > 0) {
        heldBy.set(element, count);
      } else {
        heldBy.delete(element);
        element.classList.remove(MESSAGE_OUT_GRADIENT_HELD_CLASS);
      }
    }
  };
}

// * the gradient's colour at a height of its frame, from 0 at its bottom to 1 at its top
export function getOutgoingMessageGradientColor(colors: ColorRgb[], fromBottom: number) {
  const at = clamp(fromBottom, 0, 1) * (colors.length - 1);
  const index = Math.min(Math.floor(at), colors.length - 2);
  return rgbaToHexa(mixColors(colors[index + 1], colors[index], at - index));
}

// * the colour a bubble of the gradient is (nearly) all of where it stands (`box`, on the page as the frame is): the
// * gradient's at its middle
export function getOutgoingMessageGradientColorAt(
  {colors, frame}: {colors: ColorRgb[], frame: {top: number, bottom: number}},
  box: {top: number, bottom: number}
) {
  return getOutgoingMessageGradientColor(colors, (frame.bottom - (box.top + box.bottom) / 2) / (frame.bottom - frame.top));
}
