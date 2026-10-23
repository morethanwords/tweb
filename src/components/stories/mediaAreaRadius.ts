import {MediaAreaCoordinates} from '@layer';

/**
 * A media area's corner radius, as CSS. `coordinates.radius` is a percentage of the area's WIDTH
 * (iOS, Android); an area that omits it is rounded by .2 of its height (Android's
 * `AreaView.getInnerRadius`).
 */
export default function getMediaAreaRadius({w, h, radius}: MediaAreaCoordinates) {
  return radius !== undefined ?
    `calc(var(--stories-width) * ${w / 100 * radius / 100})` :
    `calc(var(--stories-height) * ${h / 100 * .2})`;
}
