/*
 * Copyright (C) 2019-2021 Artem Kolnogorov and unknown creator of the script taken from http://useless.altervista.org/gradient.html
 */

// * the freeform gradient of the chat wallpapers (`ChatBackgroundGradientRenderer`) and of the outgoing bubbles of a theme
// * whose colours move (`outgoingMessageGradient`): up to four colours at points that turn by a phase at a time

export type GradientPoint = {x: number, y: number};

// * a picture of it this big is stretched over what it fills
export const GRADIENT_SIZE = 50;

export const GRADIENT_POSITIONS: GradientPoint[] = [
  {x: 0.80, y: 0.10},
  {x: 0.60, y: 0.20},
  {x: 0.35, y: 0.25},
  {x: 0.25, y: 0.60},
  {x: 0.20, y: 0.90},
  {x: 0.40, y: 0.80},
  {x: 0.65, y: 0.75},
  {x: 0.75, y: 0.40}
];

export const GRADIENT_PHASES = GRADIENT_POSITIONS.length;

/**
 * The freeform gradient of up to four colours at a phase, `progress` of the way to it from the phase after it
 * (1 is the phase itself): RGBA pixels of a picture of `width`×`height`
 */
export function getGradientPixels(
  colors: {r: number, g: number, b: number}[],
  phase: number,
  progress = 1,
  width = GRADIENT_SIZE,
  height = GRADIENT_SIZE,
  pixels = new Uint8ClampedArray(width * height * 4)
) {
  const colorsLength = colors.length;

  const positionsForPhase = (phase: number) => {
    const result: GradientPoint[] = [];
    for(let i = 0; i != 4; ++i) {
      result[i] = {...GRADIENT_POSITIONS[(phase + i * 2) % GRADIENT_POSITIONS.length]};
      result[i].y = 1.0 - result[i].y;
    }
    return result;
  };

  const previousPhase = (phase + 1) % GRADIENT_POSITIONS.length;
  const previous = positionsForPhase(previousPhase);
  const current = positionsForPhase(phase);

  let offset = 0;
  for(let y = 0; y < height; ++y) {
    const directPixelY = y / height;
    const centerDistanceY = directPixelY - 0.5;
    const centerDistanceY2 = centerDistanceY * centerDistanceY;
    for(let x = 0; x < width; ++x) {
      const directPixelX = x / width;
      const centerDistanceX = directPixelX - 0.5;
      const centerDistance = Math.sqrt(centerDistanceX * centerDistanceX + centerDistanceY2);

      const swirlFactor = 0.35 * centerDistance;
      const theta = swirlFactor * swirlFactor * 0.8 * 8.0;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      const pixelX = Math.max(0.0, Math.min(1.0, 0.5 + centerDistanceX * cosTheta - centerDistanceY * sinTheta));
      const pixelY = Math.max(0.0, Math.min(1.0, 0.5 + centerDistanceX * sinTheta + centerDistanceY * cosTheta));

      let distanceSum = 0.0;
      let r = 0.0;
      let g = 0.0;
      let b = 0.0;
      for(let i = 0; i < colorsLength; ++i) {
        const colorX = previous[i].x + (current[i].x - previous[i].x) * progress;
        const colorY = previous[i].y + (current[i].y - previous[i].y) * progress;

        const distanceX = pixelX - colorX;
        const distanceY = pixelY - colorY;

        let distance = Math.max(0.0, 0.9 - Math.sqrt(distanceX * distanceX + distanceY * distanceY));
        distance = distance * distance * distance * distance;
        distanceSum += distance;

        r += distance * colors[i].r;
        g += distance * colors[i].g;
        b += distance * colors[i].b;
      }

      pixels[offset++] = r / distanceSum;
      pixels[offset++] = g / distanceSum;
      pixels[offset++] = b / distanceSum;
      pixels[offset++] = 0xFF;
    }
  }

  return pixels;
}
