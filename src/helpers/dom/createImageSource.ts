import {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';

/** A new image element with `url` loaded into it */
export default async function createImageSource(url: string) {
  const img = new Image();
  await renderImageFromUrlPromise(img, url);
  return img;
}
