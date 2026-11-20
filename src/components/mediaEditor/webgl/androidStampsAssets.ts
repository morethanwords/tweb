import radial from '@/assets/mediaEditor/android/paint_radial_brush.webp?url';
import elliptical from '@/assets/mediaEditor/android/paint_elliptical_brush.webp?url';
import neon from '@/assets/mediaEditor/android/paint_neon_brush.webp?url';

export const androidStampAssets = {radial, elliptical, neon};
export type AndroidStampImages = Record<keyof typeof androidStampAssets, ImageBitmap>;

/** Caller closes the returned bitmaps after upload. Bundled pinned assets only;
 * no remote source downloads or runtime hash-verification path.
 */
export async function loadAndroidStampImages(): Promise<AndroidStampImages> {
  const images: Partial<AndroidStampImages> = {};
  try {
    // Sequential decode makes partial-failure ownership deterministic.
    for(const key of Object.keys(androidStampAssets) as (keyof AndroidStampImages)[]) {
      const response = await fetch(androidStampAssets[key]);
      if(!response.ok) throw new Error(`Unable to load Android stamp: ${key}`);
      const image = await createImageBitmap(await response.blob(), {premultiplyAlpha: 'none', colorSpaceConversion: 'none', imageOrientation: 'none'});
      images[key] = image;
      if(image.width !== 256 || image.height !== 256) throw new Error('Invalid Android stamp dimensions');
    }
    return images as AndroidStampImages;
  } catch(error) {
    Object.values(images).forEach(image => image.close());
    throw error;
  }
}
