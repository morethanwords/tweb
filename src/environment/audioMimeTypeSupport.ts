export type AUDIO_MIME_TYPE = 'audio/mpeg' | 'audio/aac' | 'audio/wav';
const AUDIO_MIME_TYPES_SUPPORTED: Set<AUDIO_MIME_TYPE> = new Set([
  'audio/mpeg',
  'audio/aac',
  'audio/wav'
]);

export default AUDIO_MIME_TYPES_SUPPORTED;
