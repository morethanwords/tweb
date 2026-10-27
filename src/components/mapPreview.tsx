import {GeoPoint} from '@layer';
import {i18n} from '@lib/langPack';
import A11yButton from '@components/a11yButton';
import confirmOpenGoogleMaps from '@components/confirmOpenGoogleMaps';
import wrapPhoto from '@components/wrappers/photo';
import getWebFileLocation from '@helpers/getWebFileLocation';
import createMiddleware from '@helpers/solid/createMiddleware';

import styles from '@components/mapPreview.module.scss';

const MAP_WIDTH = 320;
const MAP_HEIGHT = 160;
const MAP_ZOOM = 15;

/** the map of a point, across a section: a press asks before leaving for Google Maps, as a profile's location does */
export default function MapPreview(props: {geo: GeoPoint.geoPoint}) {
  return (
    <A11yButton
      class={styles.mapPreview}
      aria-label={i18n('Map').textContent}
      onClick={() => confirmOpenGoogleMaps(props.geo)}
      ref={(container) => {
        wrapPhoto({
          photo: getWebFileLocation(props.geo, MAP_WIDTH, MAP_HEIGHT, MAP_ZOOM),
          container,
          middleware: createMiddleware().get(),
          boxWidth: MAP_WIDTH,
          boxHeight: MAP_HEIGHT
        });
      }}
    />
  );
}
