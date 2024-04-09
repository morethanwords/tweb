import {GeoPoint, InputWebFileLocation} from '../layer';

export default function getWebFileLocation(
  geo: GeoPoint.geoPoint,
  width: number,
  height: number,
  zoom: number
): InputWebFileLocation.inputWebFileGeoPointLocation {
  return {
    _: 'inputWebFileGeoPointLocation',
    access_hash: geo.access_hash,
    geo_point: {
      _: 'inputGeoPoint',
      lat: geo.lat,
      long: geo.long
    },
    w: width,
    h: height,
    scale: window.devicePixelRatio,
    zoom
  };
}
