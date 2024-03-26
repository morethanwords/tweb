/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {renderImageFromUrlPromise} from './dom/renderImageFromUrl';

export function averageColorFromCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');

  const pixel = new Array(4).fill(0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixelsLength = pixels.length / 4;
  for(let i = 0; i < pixels.length; i += 4) {
    // const alphaPixel = pixels[i + 3];
    pixel[0] += pixels[i]/*  * (alphaPixel / 255) */;
    pixel[1] += pixels[i + 1]/*  * (alphaPixel / 255) */;
    pixel[2] += pixels[i + 2]/*  * (alphaPixel / 255) */;
    pixel[3] += pixels[i + 3];
  }

  const outPixel = new Uint8ClampedArray(4);
  outPixel[0] = pixel[0] / pixelsLength;
  outPixel[1] = pixel[1] / pixelsLength;
  outPixel[2] = pixel[2] / pixelsLength;
  outPixel[3] = pixel[3] / pixelsLength;
  // outPixel[3] = 255;
  return outPixel;
}

export function averageColorFromImageSource(imageSource: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement('canvas');
  const ratio = width / height;
  const DIMENSIONS = 50;
  if(ratio === 1) {
    canvas.width = DIMENSIONS;
    canvas.height = canvas.width / ratio;
  } else if(ratio > 1) {
    canvas.height = DIMENSIONS;
    canvas.width = canvas.height / ratio;
  } else {
    canvas.width = canvas.height = DIMENSIONS;
  }

  const context = canvas.getContext('2d');
  context.drawImage(imageSource, 0, 0, width, height, 0, 0, canvas.width, canvas.height);
  return averageColorFromCanvas(canvas);
}

export function averageColorFromImage(image: HTMLImageElement) {
  return averageColorFromImageSource(image, image.naturalWidth, image.naturalHeight);
}

export async function averageColor(imageUrl: string) {
  const img = document.createElement('img');
  await renderImageFromUrlPromise(img, imageUrl, false);
  return averageColorFromImage(img);
};
