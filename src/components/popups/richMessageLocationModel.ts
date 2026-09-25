export type RichMessageMapCenter = {
  latitude: number,
  longitude: number
};

const MAX_MERCATOR_LATITUDE = 85.05112878;

export function composeRichMessageMapCaption(title: string, address: string) {
  return [title.trim(), address.trim()].filter(Boolean).join('\n');
}

export function splitRichMessageMapCaption(caption = '') {
  const newline = caption.indexOf('\n');
  return newline === -1 ? {
    address: '',
    title: caption
  } : {
    address: caption.slice(newline + 1),
    title: caption.slice(0, newline)
  };
}

export function normalizeRichMessageMapCenter(
  center: RichMessageMapCenter
): RichMessageMapCenter {
  const latitude = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, center.latitude)
  );
  const longitude = ((center.longitude + 180) % 360 + 360) % 360 - 180;
  return {latitude, longitude};
}

export function panRichMessageMapCenter(
  center: RichMessageMapCenter,
  deltaX: number,
  deltaY: number,
  zoom: number
) {
  const normalized = normalizeRichMessageMapCenter(center);
  const worldSize = 256 * 2 ** zoom;
  const sine = Math.sin(normalized.latitude * Math.PI / 180);
  const worldY = (
    .5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)
  ) * worldSize;
  const nextWorldY = Math.max(0, Math.min(worldSize, worldY + deltaY));
  const mercatorY = .5 - nextWorldY / worldSize;
  return normalizeRichMessageMapCenter({
    latitude: 90 - 360 * Math.atan(Math.exp(-mercatorY * 2 * Math.PI)) / Math.PI,
    longitude: normalized.longitude + deltaX / worldSize * 360
  });
}
