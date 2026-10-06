import {MediaSize} from '@helpers/mediaSize';
import scaleMediaElement from '@helpers/canvas/scaleMediaElement';
import {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';
import clearMediaElementSource from '@helpers/dom/clearMediaElementSource';
import {ObjectURLScope} from '@helpers/objectUrl';

// * account.uploadWallPaper answers WALLPAPER_DIMENSIONS_INVALID for a large picture (a 6199×3871
// * photo is refused), so the file is prepared the way tdesktop prepares its own
// * (Ui::PreprocessBackgroundImage + PrepareWallPaper): a side longer than 40× the other is cut
// * down around the centre, the result is fitted into 2960×2960 and re-encoded as a JPEG.
const WALLPAPER_MAX_SIDE = 2960;
const WALLPAPER_MAX_ASPECT = 40;
const WALLPAPER_JPEG_QUALITY = 0.87;

export function getWallPaperImageGeometry(width: number, height: number) {
  let crop: {x: number, y: number, width: number, height: number};
  if(width > WALLPAPER_MAX_ASPECT * height) {
    const cropWidth = WALLPAPER_MAX_ASPECT * height;
    crop = {x: (width - cropWidth) / 2 | 0, y: 0, width: cropWidth, height};
  } else if(height > WALLPAPER_MAX_ASPECT * width) {
    const cropHeight = WALLPAPER_MAX_ASPECT * width;
    crop = {x: 0, y: (height - cropHeight) / 2 | 0, width, height: cropHeight};
  }

  const size = new MediaSize(crop?.width ?? width, crop?.height ?? height)
  .aspectFitted(new MediaSize(WALLPAPER_MAX_SIDE, WALLPAPER_MAX_SIDE));
  return {crop, size};
}

export default async function prepareWallPaperImage(file: File) {
  const objectURLs = new ObjectURLScope();
  const image = new Image();
  try {
    await renderImageFromUrlPromise(image, objectURLs.create(file), false);
    const {naturalWidth: width, naturalHeight: height} = image;
    if(!width || !height) {
      throw new Error('wallpaper image cannot be decoded');
    }

    const {crop, size} = getWallPaperImageGeometry(width, height);
    const {blob} = await scaleMediaElement({
      media: image,
      crop,
      size,
      mimeType: 'image/jpeg',
      quality: WALLPAPER_JPEG_QUALITY
    });

    return new File([blob], file.name.replace(/\.[^.]*$/, '') + '.jpg', {type: 'image/jpeg'});
  } finally {
    clearMediaElementSource(image);
    objectURLs.dispose();
  }
}
