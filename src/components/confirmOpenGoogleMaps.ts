import {GeoPoint} from '@layer';
import confirmationPopup from '@components/confirmationPopup';
import makeGoogleMapsUrl from '@helpers/makeGoogleMapsUrl';
import safeWindowOpen from '@helpers/dom/safeWindowOpen';

/** "Open in Google Maps?", asked before a point leaves for Google Maps: whether to go. */
export function askOpenGoogleMaps() {
  return confirmationPopup({
    descriptionLangKey: 'Popup.OpenInGoogleMaps',
    button: {
      langKey: 'Open'
    }
  }).then(() => true, () => false);
}

/** A point leaves for Google Maps only once asked — a profile's location, a page's map. */
export default async function confirmOpenGoogleMaps(geo: GeoPoint.geoPoint) {
  if(await askOpenGoogleMaps()) safeWindowOpen(makeGoogleMapsUrl(geo));
}
