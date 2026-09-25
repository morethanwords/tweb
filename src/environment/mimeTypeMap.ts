export const EXTENSION_MIME_TYPE_MAP: {[ext in MTFileExtension]: MTMimeType} = {
  pdf: 'application/pdf',
  tgv: 'application/x-tgwallpattern',
  tgs: 'application/x-tgsticker',
  json: 'application/json',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  opus: 'audio/ogg',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  ogv: 'video/ogg',
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
  bmp: 'image/bmp',
  // * heic last so that the reverse map prefers it over the heif spelling
  heif: 'image/heic',
  heic: 'image/heic'
};

export const MIME_TYPE_ALIASES: Record<string, MTMimeType> = {
  'audio/m4a': 'audio/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/opus': 'audio/ogg',
  'audio/x-aac': 'audio/aac',
  'audio/x-flac': 'audio/flac',
  'audio/x-m4a': 'audio/mp4',
  'audio/x-mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/x-ogg': 'audio/ogg',
  'audio/x-opus+ogg': 'audio/ogg',
  'audio/x-wav': 'audio/wav',
  // * same container and decoder, only a different brand in the header
  'image/heif': 'image/heic',
  'video/x-quicktime': 'video/quicktime'
};

export const MIME_TYPE_EXTENSION_MAP: {[mimeType in MTMimeType]?: MTFileExtension} = {};

for(const ext in EXTENSION_MIME_TYPE_MAP) {
  MIME_TYPE_EXTENSION_MAP[EXTENSION_MIME_TYPE_MAP[ext as MTFileExtension]] = ext as MTFileExtension;
}
