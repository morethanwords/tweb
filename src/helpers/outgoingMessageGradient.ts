import {channelsLuminance, ColorRgb, darkenToMaxLuminance, ensureTextContrast, getContrastRatio, getHexColorFromTelegramColor, hexToRgb, mixColors, relativeLuminance, rgbaToHexa} from '@helpers/color';
import {getGradientPixels, GRADIENT_PHASES, GRADIENT_SIZE} from '@helpers/freeformGradient';
import clamp from '@helpers/number/clamp';

// * the outgoing bubbles' fill when the theme gives them more than one colour: a gradient over the chat's frame
// * (`.bubbles`), of which every bubble shows the part it stands over, as on Android, iOS and Desktop
// * (`message-out-gradient` in _chatBubble.scss) - vertical, or the wallpapers' freeform one when the theme's colours
// * move. Properties of the element the theme is applied on, so a chat's theme covers the app's, `none` included: the
// * gradient as a background (the theme's tile), the pictures of it the bubbles are filled with (`-image-<phase>`,
// * the same one at every phase but the freeform gradient's), and how they are drawn
export const MESSAGE_OUT_GRADIENT_PROPERTY = '--message-out-gradient';
const IMAGE_PROPERTY = '--message-out-gradient-image';
export const MESSAGE_OUT_GRADIENT_IMAGE_PROPERTY = `${IMAGE_PROPERTY}-0`;
// * 1 for the freeform gradient: its picture is stretched over the whole frame, not from a column
const FREEFORM_PROPERTY = '--message-out-gradient-freeform';
// * whether the theme has a gradient, for what draws it to be laid out (`display`): a piece is a layer of the
// * compositor's even when it draws nothing
const DISPLAY_PROPERTY = '--message-out-gradient-display';
// * the freeform gradient's next phase is drawn by a piece of its own, which comes up over the current one
const NEXT_DISPLAY_PROPERTY = '--message-out-gradient-next-display';
// * a bubble of a gradient paints its own colour under its piece of it, in the piece's clip, and not itself: the
// * colour of the bubble stood out as a rim where the compositor cut the piece a pixel short of what the bubble painted
const CONTENT_BACKGROUND_PROPERTY = '--message-out-gradient-content-background';
const UNDER_PROPERTY = '--message-out-gradient-under';
// * a tint of the accent in a bubble of a gradient (a reaction) is see-through, as on iOS and Android: the filled one is
// * mixed with the bubble's own colour, which is not seen there
const LIGHT_PRIMARY_PROPERTY = '--message-out-gradient-light-primary-color';

// * the freeform gradient's phase, and its move to the next one, are classes of the chat's frame, which its pieces take
// * their pictures by (`message-out-gradient-phase` in _chatBubble.scss): a property changed there would restyle every
// * message, a class only what it is written for
const PHASE_CLASS = 'message-out-gradient-phase-';
const ADVANCING_CLASS = 'is-message-out-gradient-advancing';
// * the move takes as long as the scroll the wallpaper's takes, in steps of 50ms (250ms to 600ms, `fastSmoothScroll`)
const ADVANCE_CLASS = 'message-out-gradient-advance-';
const ADVANCE_STEP = 50;
const ADVANCE_STEPS = [5, 12];

export type OutgoingMessageGradient = {
  // * vertical: the colours from the bottom up; freeform: those of its points
  colors: ColorRgb[],
  // * the text the freeform gradient is read under, which each of its pixels is moved for
  freeform?: {textColor: ColorRgb}
};

// * what a gradient's piece is filled with, a picture stretched over the frame: its pixels, to tell the colour at a place
type Picture = {width: number, height: number, pixels: Uint8ClampedArray};

// * the vertical gradient's picture is a column a pixel wide, which every part of a bubble stretches across: the
// * compositor draws it from that column, where a gradient as wide as the frame would be painted again in full for
// * every part; the freeform one's is the wallpapers' picture, which the compositor stretches as it is
const IMAGE_HEIGHT = 256;
const images = new Map<string, string>();
const pictures = new Map<string, Picture>();

// * what the text is read on (WCAG's for text), and how far under it a moved colour may land, rounded to whole channels
const READABLE_CONTRAST = 4.5;
const ROUNDING = .05;
// * how many colours are put between two of the theme's, at first and at most: where they mix the text has to be read
// * too, and a mix of two colours can be darker or lighter than both
const STEPS_BETWEEN = 4;
const MAX_STEPS_BETWEEN = 32;
// * a reaction in a bubble of a gradient is a see-through tint of the bubbles' own colour over it
// * (`--light-message-out-primary-color`, made with this by themeController), and its counter is of that colour
export const MESSAGE_OUT_TINT = .08;

// * a reaction's tint of a colour over another, as the page mixes it
function tintOver(under: ColorRgb, color: ColorRgb) {
  return under.map((value, channel) => value + (color[channel] - value) * MESSAGE_OUT_TINT) as ColorRgb;
}

/**
 * Whether the outgoing text reads on a colour of the gradient, and on a tint of the text over it: a reaction's counter
 * is of the bubbles' own colour, which is the text's under light text (the night's) and under dark text no lighter than
 * it takes to read (`keepReadableOnOutgoingMessageGradient`), and it stands on a tint of itself
 */
function readsUnder(color: ColorRgb, textColor: ColorRgb, ratio = READABLE_CONTRAST) {
  return getContrastRatio(color, textColor) >= ratio && getContrastRatio(tintOver(color, textColor), textColor) >= ratio;
}

// * a colour moved as far from the text as it takes to be read on, the text's tint over it included (`readsUnder`)
function makeReadable(color: ColorRgb, textColor: ColorRgb): ColorRgb {
  // * ensureTextContrast moves its first colour against the second, which is the text here
  const hex = rgbaToHexa(color);
  const moved = (ratio: number) => hexToRgb(ensureTextContrast(hex, textColor, ratio));
  let [low, high] = [READABLE_CONTRAST, 21];
  if(readsUnder(moved(low), textColor)) {
    return moved(low);
  }

  for(let i = 0; i < 16; ++i) {
    const ratio = (low + high) / 2;
    if(readsUnder(moved(ratio), textColor)) high = ratio;
    else low = ratio;
  }

  return moved(high);
}

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
        return makeReadable(next ? mixColors(next, color, step / steps) : color, textColor);
      });
    });

    const readable = getPainted(gradient).every((color) => readsUnder(color, textColor, READABLE_CONTRAST - ROUNDING));
    if(readable || steps >= MAX_STEPS_BETWEEN) {
      return gradient;
    }
  }
}

// * the colours the gradient is painted in: its own and the mixes of each two that stand side by side
function getPainted(colors: ColorRgb[]) {
  return colors.flatMap((color, index) => index ? [.25, .5, .75].map((t) => mixColors(color, colors[index - 1], t)).concat([color]) : [color]);
}

// * the mixes of the freeform gradient's points' colours the text is read on, in steps of 1/20 of each: every colour it
// * is painted in is one (a pixel mixes them, so does a crossfade of two pixels when it moves, and the compositor
// * stretching its picture), and the darkest one (under dark text, the one that reads worst) can be between them
const MIX_STEPS = 20;

function getMixes(colors: ColorRgb[]) {
  const mixes: ColorRgb[] = [];
  const mix = (index: number, left: number, r: number, g: number, b: number) => {
    const [cr, cg, cb] = colors[index];
    if(index === colors.length - 1) {
      const weight = left / MIX_STEPS;
      mixes.push([r + cr * weight, g + cg * weight, b + cb * weight]);
      return;
    }

    for(let steps = 0; steps <= left; ++steps) {
      const weight = steps / MIX_STEPS;
      mix(index + 1, left - steps, r + cr * weight, g + cg * weight, b + cb * weight);
    }
  };

  mix(0, MIX_STEPS, 0, 0, 0);
  return mixes;
}

function getDarkestMix(colors: ColorRgb[]) {
  return getMixes(colors).reduce((darkest, [r, g, b]) => Math.min(darkest, channelsLuminance(r, g, b)), Infinity);
}

/**
 * Three colours or four that move (`message_colors_animated`) are the wallpapers' freeform gradient of them, as on
 * Android: its points' colours, each moved to read the text on (`readsUnder`), and all of them further, to white, as far
 * as it takes for every mix of them, and the text's tint over it, to read too (a mix of colours can be darker than any of
 * them; under light text it is not lighter than all of them, nor is a tint over it)
 */
export function getOutgoingMessageFreeformColors(colors: number[] | undefined, textColor: ColorRgb): ColorRgb[] | undefined {
  const hexes = (colors || []).slice(0, 4).map(getHexColorFromTelegramColor);
  if(hexes.length < 3 || new Set(hexes).size < 2) {
    return;
  }

  const points = hexes.map((hex) => makeReadable(hexToRgb(hex), textColor));
  const textLuminance = relativeLuminance(textColor);
  const toWhite = (by: number) => points.map((color) => color.map((value) => Math.ceil(value + (255 - value) * by)) as ColorRgb);
  // * under dark text the text's tint takes a mix darker still, and a tint of every mix is a mix of the tinted points
  const read = (by: number) => {
    const darkest = getDarkestMix(toWhite(by).map((point) => tintOver(point, textColor)));
    return (darkest + .05) / (textLuminance + .05) >= READABLE_CONTRAST;
  };
  if(textLuminance > .179 || read(0)) {
    return points;
  }

  let [low, high] = [0, 1];
  for(let i = 0; i < 10; ++i) {
    const by = (low + high) / 2;
    if(read(by)) high = by;
    else low = by;
  }

  return toWhite(high);
}

export function getOutgoingMessageGradient(colors: number[] | undefined, animated: boolean, textColor: ColorRgb): OutgoingMessageGradient | undefined {
  const freeform = animated && getOutgoingMessageFreeformColors(colors, textColor);
  if(freeform) {
    return {colors: freeform, freeform: {textColor}};
  }

  const vertical = getOutgoingMessageGradientColors(colors, textColor);
  return vertical && {colors: vertical};
}

export function makeOutgoingMessageGradient(colors: ColorRgb[] | undefined) {
  // the first colour at the bottom, by the newest messages (Android)
  return colors ? `linear-gradient(to top, ${colors.map(rgbaToHexa).join(', ')})` : 'none';
}

function makeImage(key: string, width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) {
  let image = images.get(key);
  if(!image) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    // * drawn and read back in memory: a canvas of the GPU took ~25ms to encode one so small
    const context = canvas.getContext('2d', {willReadFrequently: true});
    if(!context) {
      return 'none';
    }

    draw(context);
    const url = canvas.toDataURL();
    images.set(key, image = `url("${url}")`);
    pictures.set(url, {width, height, pixels: context.getImageData(0, 0, width, height).data});
  }

  return image;
}

export function makeOutgoingMessageGradientImage(colors: ColorRgb[] | undefined) {
  const hexes = colors?.map(rgbaToHexa);
  const key = hexes?.join();
  if(!key) {
    return 'none';
  }

  return makeImage(key, 1, IMAGE_HEIGHT, (context) => {
    const gradient = context.createLinearGradient(0, IMAGE_HEIGHT, 0, 0);
    hexes.forEach((hex, index) => gradient.addColorStop(index / (hexes.length - 1), hex));
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1, IMAGE_HEIGHT);
  });
}

function getFreeformKey({colors, freeform}: OutgoingMessageGradient) {
  return [...colors, freeform.textColor].map(rgbaToHexa).join();
}

const freeformPixels = new Map<string, Uint8ClampedArray>();

/** the freeform gradient's picture at a phase: mixes of its points' colours, which all read (`getOutgoingMessageFreeformColors`) */
export function getOutgoingMessageFreeformPixels(gradient: OutgoingMessageGradient, phase: number) {
  const key = `${getFreeformKey(gradient)}@${phase}`;
  let pixels = freeformPixels.get(key);
  if(!pixels) {
    freeformPixels.set(key, pixels = getGradientPixels(gradient.colors.map(([r, g, b]) => ({r, g, b})), phase));
  }

  return pixels;
}

function makeFreeformImage(gradient: OutgoingMessageGradient, phase: number) {
  return makeImage(`${getFreeformKey(gradient)}@${phase}`, GRADIENT_SIZE, GRADIENT_SIZE, (context) => {
    const imageData = context.createImageData(GRADIENT_SIZE, GRADIENT_SIZE);
    imageData.data.set(getOutgoingMessageFreeformPixels(gradient, phase));
    context.putImageData(imageData, 0, 0);
  });
}

/**
 * A colour of the bubbles' own under dark text (the time, the ticks, the links, a reaction's counter), darkened to be read
 * all over their gradient, the freeform one's moves included, and on its own tint over it (a reaction)
 */
export function keepReadableOnOutgoingMessageGradient(hex: string, gradient: OutgoingMessageGradient) {
  const painted = gradient.freeform ? getMixes(gradient.colors) : getPainted(gradient.colors);
  const luminances = painted.map(relativeLuminance);
  const contrast = (a: number, b: number) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  const reads = (accent: string) => {
    const rgb = hexToRgb(accent);
    const luminance = relativeLuminance(rgb);
    return painted.every((color, index) => {
      return contrast(luminance, luminances[index]) >= READABLE_CONTRAST &&
        contrast(luminance, relativeLuminance(tintOver(color, rgb))) >= READABLE_CONTRAST;
    });
  };

  // * read on the darkest colour, where its own tint does not take it under
  const darkest = Math.min(...luminances);
  let [low, high] = [0, (darkest + .05) / READABLE_CONTRAST - .05];
  if(reads(darkenToMaxLuminance(hex, high))) {
    return darkenToMaxLuminance(hex, high);
  }

  for(let i = 0; i < 16; ++i) {
    const luminance = (low + high) / 2;
    if(reads(darkenToMaxLuminance(hex, luminance))) low = luminance;
    else high = luminance;
  }

  return darkenToMaxLuminance(hex, low);
}

type FrameMove = {phase: number, advancing?: number};
// * the phase each chat's freeform gradient is at, as its wallpaper's is its own
const frameMoves = new WeakMap<HTMLElement, FrameMove>();

function setClasses(frame: HTMLElement, phase: number, advance?: number) {
  for(let index = 0; index < GRADIENT_PHASES; ++index) {
    frame.classList.toggle(PHASE_CLASS + index, index === phase);
  }

  for(let step = ADVANCE_STEPS[0]; step <= ADVANCE_STEPS[1]; ++step) {
    frame.classList.toggle(ADVANCE_CLASS + step * ADVANCE_STEP, step === advance);
  }

  frame.classList.toggle(ADVANCING_CLASS, advance !== undefined);
}

// * what draws the gradient for a whole chat (`OutgoingGradientUnion`), told of a theme applied: it may give the chat a
// * gradient or take it away
const appliedListeners = new Set<VoidFunction>();
export function subscribeOutgoingMessageGradient(callback: VoidFunction) {
  appliedListeners.add(callback);
  return (): void => void appliedListeners.delete(callback);
}

/** whether the outgoing bubbles where the element is are of a gradient (a read of its computed style) */
export function hasOutgoingMessageGradient(element: Element) {
  const image = getComputedStyle(element).getPropertyValue(MESSAGE_OUT_GRADIENT_IMAGE_PROPERTY).trim();
  return !!image && image !== 'none';
}

/** the outgoing bubbles' gradient of a theme on the element it is applied on (`themeController`) */
export function applyOutgoingMessageGradient(element: HTMLElement, gradient: OutgoingMessageGradient | undefined) {
  let background = 'none';
  const images = new Array<string>(GRADIENT_PHASES).fill('none');
  if(gradient?.freeform) {
    images.forEach((_, index) => images[index] = makeFreeformImage(gradient, index));
    background = images[0];
  } else if(gradient) {
    images.fill(makeOutgoingMessageGradientImage(gradient.colors));
    background = makeOutgoingMessageGradient(gradient.colors);
  }

  element.style.setProperty(MESSAGE_OUT_GRADIENT_PROPERTY, background);
  images.forEach((image, index) => element.style.setProperty(`${IMAGE_PROPERTY}-${index}`, image));
  element.style.setProperty(FREEFORM_PROPERTY, gradient?.freeform ? '1' : '0');
  element.style.setProperty(DISPLAY_PROPERTY, gradient ? 'block' : 'none');
  element.style.setProperty(NEXT_DISPLAY_PROPERTY, gradient?.freeform ? 'block' : 'none');
  // * `initial` is no value, and the bubble's own colour is taken instead
  element.style.setProperty(CONTENT_BACKGROUND_PROPERTY, gradient ? 'transparent' : 'initial');
  element.style.setProperty(UNDER_PROPERTY, gradient ? 'initial' : 'transparent');
  element.style.setProperty(LIGHT_PRIMARY_PROPERTY, gradient ? 'var(--light-message-out-primary-color)' : 'initial');
  appliedListeners.forEach((callback) => callback());
}

/**
 * The freeform gradient of the frame's outgoing bubbles moves on to its next phase, as the wallpaper does when a message
 * is sent, and in the same time: the pieces of the next phase come up over those of this one (their opacity, which
 * the compositor animates) and then take its place, so nothing is painted again while it moves. Returns whether it moves
 */
export function advanceOutgoingMessageGradient(frame: HTMLElement, duration: number) {
  // * the nearest theme's, read where it is set: a computed style would be worked out anew for a message just added
  let element = frame;
  while(element && !element.style.getPropertyValue(FREEFORM_PROPERTY)) {
    element = element.parentElement;
  }

  if(element?.style.getPropertyValue(FREEFORM_PROPERTY) !== '1') {
    return false;
  }

  let move = frameMoves.get(frame);
  if(!move) {
    frameMoves.set(frame, move = {phase: 0});
  }

  // * a move is not hurried by another (Android)
  if(move.advancing !== undefined) {
    return false;
  }

  // * the way the wallpaper turns (`ChatBackgroundGradientRenderer.toNextPosition`)
  const phase = (move.phase + GRADIENT_PHASES - 1) % GRADIENT_PHASES;
  const done = () => {
    move.phase = phase;
    move.advancing = undefined;
    setClasses(frame, phase);
  };

  if(!duration) {
    done();
    return true;
  }

  const step = clamp(Math.round(duration / ADVANCE_STEP), ADVANCE_STEPS[0], ADVANCE_STEPS[1]);
  setClasses(frame, move.phase, step);
  // * a frame past the end, which the compositor keeps
  move.advancing = window.setTimeout(done, step * ADVANCE_STEP + 32);
  return true;
}

export type OutgoingMessageGradientPlace = {picture: Picture, frame: {left: number, top: number, right: number, bottom: number}};

/**
 * The gradient the content of an outgoing bubble shows: the picture it is filled with (the next phase's, while it moves
 * to it), and the box it spans (the chat's frame). Nothing where the bubble is of one colour, which it is too where its
 * piece is not drawn (no picture of the gradient, no clip for a fixed piece)
 */
export function readOutgoingMessageGradient(content: Element): OutgoingMessageGradientPlace | undefined {
  const frame = content.closest('.bubbles');
  const piece = frame && content.querySelector(':scope > .bubble-gradient');
  // * while it moves, the phase it moves on to: what is measured now is seen once it is there
  const pseudo = frame?.classList.contains(ADVANCING_CLASS) ? '::after' : '::before';
  const url = piece && getComputedStyle(piece, pseudo).backgroundImage.match(/^url\("?([^")]+)"?\)$/)?.[1];
  const picture = url && pictures.get(url);
  if(!picture) {
    return;
  }

  return {picture, frame: frame.getBoundingClientRect()};
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
  if(!frame || !hasOutgoingMessageGradient(frame)) {
    return;
  }

  const frameRect = frame.getBoundingClientRect();
  const places = held.map((element) => {
    const parent = element.offsetParent as HTMLElement;
    const parentRect = parent.getBoundingClientRect();
    return {
      left: parentRect.left + parent.clientLeft + element.offsetLeft,
      top: parentRect.top + parent.clientTop + element.offsetTop
    };
  });
  return () => held.forEach((element, index) => {
    element.style.setProperty('--message-out-gradient-held-left', `${frameRect.left - places[index].left}px`);
    element.style.setProperty('--message-out-gradient-held-top', `${frameRect.top - places[index].top}px`);
    element.style.setProperty('--message-out-gradient-held-width', `${frameRect.width}px`);
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

// * the picture's colour at a place of the box it is stretched over (0 to 1 across and down), as the compositor
// * stretches it: between the middles of its pixels
function getPictureColor({width, height, pixels}: Picture, across: number, down: number) {
  const [x, y] = [clamp(across * width - .5, 0, width - 1), clamp(down * height - .5, 0, height - 1)];
  const [left, top] = [Math.floor(x), Math.floor(y)];
  const [right, bottom] = [Math.min(left + 1, width - 1), Math.min(top + 1, height - 1)];
  const at = (column: number, row: number): ColorRgb => {
    const offset = (row * width + column) * 4;
    return [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
  };

  // * mixColors weighs its first colour
  const [above, below] = [mixColors(at(left, top), at(right, top), 1 - (x - left)), mixColors(at(left, bottom), at(right, bottom), 1 - (x - left))];
  return rgbaToHexa(mixColors(above, below, 1 - (y - top)));
}

// * the colour a bubble of the gradient is (nearly) all of where it stands (`box`, on the page as the frame is): the
// * gradient's at its middle
export function getOutgoingMessageGradientColorAt(
  {picture, frame}: OutgoingMessageGradientPlace,
  box: {left: number, top: number, right: number, bottom: number}
) {
  return getPictureColor(
    picture,
    ((box.left + box.right) / 2 - frame.left) / (frame.right - frame.left),
    ((box.top + box.bottom) / 2 - frame.top) / (frame.bottom - frame.top)
  );
}
