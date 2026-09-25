export type AUDIO_MIME_TYPE =
  'audio/aac' |
  'audio/flac' |
  'audio/mp4' |
  'audio/mpeg' |
  'audio/ogg' |
  'audio/wav';

export const RICH_MESSAGE_AUDIO_FILE_EXTENSIONS_SUPPORTED = [
  '.mp3',
  '.m4a',
  '.aac',
  '.ogg',
  '.oga',
  '.flac',
  '.opus'
] as const;

export const RICH_MESSAGE_AUDIO_MIME_TYPES_SUPPORTED: Set<AUDIO_MIME_TYPE> = new Set([
  'audio/aac',
  'audio/flac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg'
]);

/** The set is keyed by the literal union, so the narrowing cast lives here once. */
export function isRichMessageAudioMimeType(mimeType: string): mimeType is AUDIO_MIME_TYPE {
  return RICH_MESSAGE_AUDIO_MIME_TYPES_SUPPORTED.has(mimeType as AUDIO_MIME_TYPE);
}

const AUDIO_MIME_TYPES_SUPPORTED: Set<AUDIO_MIME_TYPE> = new Set([
  'audio/aac',
  'audio/flac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav'
]);

export default AUDIO_MIME_TYPES_SUPPORTED;
