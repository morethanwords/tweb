// https://github.com/telegramdesktop/tdesktop/blob/0514f13af0d7d1686944e7ba909df2dab16a6f5e/Telegram/SourceFiles/core/mime_type.cpp#L327
const extensionsSet = new Set(['htm', 'html', 'svg', 'm4v', 'm3u', 'm3u8', 'xhtml', 'xml', 'kml', 'kmz']);
const mimeTypesSet = new Set(['text/html', 'image/svg+xml', 'application/vnd.google-earth.kml+xml', 'application/vnd.google-earth.kmz']);

export const isIpRevealingExtension = (extension: string) => extensionsSet.has(extension);
export const isIpRevealingMimeType = (mimeType: string) => mimeTypesSet.has(mimeType);
