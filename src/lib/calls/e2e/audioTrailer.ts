/*
 * libtgcalls audio frame trailer (see GroupInstanceCustomImpl.cpp:1466-1525).
 *
 * Official Telegram clients wrap every encrypted Opus frame with a 2-byte
 * trailer before encryption:
 *
 *   plaintext = encodedFrameData || 0x01 || encodedAudioLevelAndSpeech
 *
 * Layout of `encodedAudioLevelAndSpeech`:
 *   bit 7 (0x80) — speech detection flag
 *   bits 0..6    — audio level (0..127, signal magnitude)
 *
 * The official clients reject Opus frames that don't carry this trailer, so
 * we MUST emit it for outbound audio. We don't currently have access to the
 * `webrtc::AudioLevel` value from `RTCEncodedAudioFrame`, so the level byte
 * is a placeholder (silence, no speech). The peer accepts any valid trailer;
 * only the leading 0x01 flag matters for stripping on the recv side.
 *
 * On the recv side libtgcalls also supports an older 1-byte trailer that
 * omits the metadata byte: `result[len-2] & 0x01` tells us which form
 * arrived and how many bytes to strip.
 *
 * Video frames don't get the trailer — they're passed through raw.
 */

// Placeholder: silence (level=0) + no-speech (bit 7 clear).
const AUDIO_LEVEL_BYTE = 0x00;

/**
 * Append the 2-byte libtgcalls audio trailer to `plain`. Use BEFORE the e2e
 * encrypt step on outbound audio frames.
 */
export function appendAudioTrailer(plain: Uint8Array): Uint8Array {
  const out = new Uint8Array(plain.length + 2);
  out.set(plain, 0);
  out[plain.length] = 0x01;
  out[plain.length + 1] = AUDIO_LEVEL_BYTE;
  return out;
}

/**
 * Strip the libtgcalls audio trailer from a freshly-decrypted Opus frame.
 *
 * - If the second-to-last byte's low bit is set, strip 2 bytes (new format
 *   with audio-level metadata).
 * - Otherwise, strip 1 byte (legacy 1-byte trailer with no metadata).
 *
 * Use AFTER the e2e decrypt step on inbound audio frames.
 */
export function stripAudioTrailer(decrypted: Uint8Array): Uint8Array {
  if(decrypted.length < 1) return decrypted;
  if(decrypted.length >= 2 && (decrypted[decrypted.length - 2] & 0x01) !== 0) {
    return decrypted.subarray(0, decrypted.length - 2);
  }
  return decrypted.subarray(0, decrypted.length - 1);
}
