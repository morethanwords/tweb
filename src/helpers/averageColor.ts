/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import renderImageFromUrl from "./dom/renderImageFromUrl";

export const averageColor = (imageUrl: string): Promise<Uint8ClampedArray> => {
  const img = document.createElement('img');
  return new Promise<Uint8ClampedArray>((resolve) => {
    renderImageFromUrl(img, imageUrl, () => {
      const canvas = document.createElement('canvas');
      const ratio = img.naturalWidth / img.naturalHeight;
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
      context.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, canvas.width, canvas.height);

      const pixel = new Array(4).fill(0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for(let i = 0; i < pixels.length; i += 4) {
        pixel[0] += pixels[i];
        pixel[1] += pixels[i + 1];
        pixel[2] += pixels[i + 2];
        pixel[3] += pixels[i + 3];
      }

      const pixelsLength = pixels.length / 4;
      const outPixel = new Uint8ClampedArray(4);
      outPixel[0] = pixel[0] / pixelsLength;
      outPixel[1] = pixel[1] / pixelsLength;
      outPixel[2] = pixel[2] / pixelsLength;
      outPixel[3] = pixel[3] / pixelsLength;
      resolve(outPixel);
    });
  });
};
