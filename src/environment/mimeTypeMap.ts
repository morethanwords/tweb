export const EXTENSION_MIME_TYPE_MAP: {[ext in MTFileExtension]: MTMimeType} = {
  pdf: 'application/pdf',
  tgv: 'application/x-tgwallpattern',
  tgs: 'application/x-tgsticker',
  json: 'application/json',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  jxl: 'image/jxl',
  bmp: 'image/bmp'
};

export const MIME_TYPE_EXTENSION_MAP: {[mimeType in MTMimeType]?: MTFileExtension} = {};

for(const ext in EXTENSION_MIME_TYPE_MAP) {
  MIME_TYPE_EXTENSION_MAP[EXTENSION_MIME_TYPE_MAP[ext as MTFileExtension]] = ext as MTFileExtension;
}
