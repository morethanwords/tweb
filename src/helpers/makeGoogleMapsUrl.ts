import {GeoPoint} from '../layer';

export default function makeGoogleMapsUrl(geo: GeoPoint.geoPoint) {
  return 'https://maps.google.com/maps?q=' + geo.lat + ',' + geo.long;
}
