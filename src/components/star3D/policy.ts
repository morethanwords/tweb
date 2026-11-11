import type {AnimationLevel} from '@helpers/liteMode';
import type {StarOptions} from '@vendor/telegram-3d-star/src/index';
import {PAGE_COLORS, resolveLook, type Look} from '@vendor/telegram-3d-star/src/options';

export type Star3DMotion = Required<Pick<StarOptions, 'autoplay' | 'interactive' | 'reducedMotion'>>;

/**
 * What the star does at an animation level: nothing at 0 (the poster stands instead), a star at rest at 1 that only
 * fades in, idle turns, glints and drags at 2. The OS reduce-motion preference reaches it through the level alone
 * (`liteMode` takes it under the a11y layer), never through the package's own media query.
 */
export function getStar3DMotion(level: AnimationLevel): Star3DMotion {
  if(!level) {
    return;
  }

  const full = level === 2;
  return {autoplay: full, interactive: full, reducedMotion: false};
}

/**
 * The look for the colour painted behind the star — light or dark by its luminance, the way the package decides it —
 * or, with no opaque colour found, the theme's page colour
 */
export function getStar3DLook(background: string | undefined, isNight: boolean): Look {
  return resolveLook(undefined, background || PAGE_COLORS[isNight ? 'dark' : 'light']);
}

/**
 * The particle field's width: the visible width of the box that clips it, less twice the star's distance from that
 * box's middle, so that the field, centred on the star, never reaches past either of its edges
 */
export function getStar3DFieldWidth(clipWidth: number, starOffset: number): number {
  return Math.max(0, Math.floor(clipWidth - 2 * Math.abs(starOffset)));
}
