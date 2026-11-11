import {JSX} from 'solid-js';
import maybe2x from '@helpers/maybe2x';
import createImageSource from '@helpers/dom/createImageSource';
import Star3D from '@components/star3D';

/** The picture of a Stars popup's header: the particles on their own, loaded before the popup opens. */
export async function createStarsParticles(): Promise<HTMLImageElement> {
  const img = await createImageSource(`assets/img/${maybe2x('stars_pay')}.png`);
  img.alt = '';
  img.classList.add('popup-stars-image');
  return img;
}

/**
 * The gold 3D star in the place of the picture it stands for (194 wide), 120 px with 12 px of room above and
 * below: the star brings its own particle field (the poster has none).
 */
export default function StarsHero(): JSX.Element {
  return (
    <div class="popup-stars-image popup-stars-hero">
      <Star3D kind="stars" size={120} />
    </div>
  );
}
