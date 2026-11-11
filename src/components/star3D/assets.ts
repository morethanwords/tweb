import type {StarAssets, StarKind, StarTheme} from '@vendor/telegram-3d-star/src/index';
import fetchArrayBuffer from '@helpers/fetchArrayBuffer';
import loadDecodedImage from '@helpers/dom/loadDecodedImage';
import meshUrl from '@vendor/telegram-3d-star/assets/star.mesh?url';
import flecksUrl from '@vendor/telegram-3d-star/assets/flecks.png?url';
import premiumDark from '@vendor/telegram-3d-star/posters/premium-dark.png?url';
import premiumDark2x from '@vendor/telegram-3d-star/posters/premium-dark@2x.png?url';
import premiumDark3x from '@vendor/telegram-3d-star/posters/premium-dark@3x.png?url';
import premiumLight from '@vendor/telegram-3d-star/posters/premium-light.png?url';
import premiumLight2x from '@vendor/telegram-3d-star/posters/premium-light@2x.png?url';
import premiumLight3x from '@vendor/telegram-3d-star/posters/premium-light@3x.png?url';
import starsDark from '@vendor/telegram-3d-star/posters/stars-dark.png?url';
import starsDark2x from '@vendor/telegram-3d-star/posters/stars-dark@2x.png?url';
import starsDark3x from '@vendor/telegram-3d-star/posters/stars-dark@3x.png?url';
import starsLight from '@vendor/telegram-3d-star/posters/stars-light.png?url';
import starsLight2x from '@vendor/telegram-3d-star/posters/stars-light@2x.png?url';
import starsLight3x from '@vendor/telegram-3d-star/posters/stars-light@3x.png?url';

// * the star at rest for 1x, 2x and 3x screens, for no WebGL and animations off
const POSTERS: {[kind in StarKind]: {[theme in StarTheme]: [string, string, string]}} = {
  premium: {
    dark: [premiumDark, premiumDark2x, premiumDark3x],
    light: [premiumLight, premiumLight2x, premiumLight3x]
  },
  stars: {
    dark: [starsDark, starsDark2x, starsDark3x],
    light: [starsLight, starsLight2x, starsLight3x]
  }
};

export function getStar3DPoster(kind: StarKind, theme: StarTheme) {
  const urls = POSTERS[kind][theme];
  return {
    src: urls[0],
    srcset: urls.map((url, index) => `${url} ${index + 1}x`).join(', ')
  };
}

let loading: Promise<StarAssets>;

/**
 * The mesh's bytes and the decoded flecks, fetched once per page for every star (the package parses the mesh once
 * per buffer). A failed load is not kept, so the next star tries again.
 */
export function loadStar3DAssets() {
  return loading ??= Promise.all([
    fetchArrayBuffer(meshUrl),
    loadDecodedImage(flecksUrl)
  ]).then(([mesh, flecks]): StarAssets => ({mesh, flecks}), (error) => {
    loading = undefined;
    throw error;
  });
}
