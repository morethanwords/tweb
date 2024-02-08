export const CRBUG_1250841_ERROR = 'DECODER_ERROR_NOT_SUPPORTED: Audio configuration specified 2 channels, but FFmpeg thinks the file contains 1 channels';

export default function isCrbug1250841Error(err: MediaError) {
  return err.code ===  4 && err.message === CRBUG_1250841_ERROR;
}
