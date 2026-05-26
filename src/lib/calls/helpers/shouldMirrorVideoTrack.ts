// Decide whether a `<video>` element backed by a given track should get the
// `.call-video-mirror` class. Front-facing ("user") and unspecified-facing
// tracks read as a mirror (selfie expectation: pat hair on the correct side);
// rear-facing ("environment") tracks render in their native orientation
// because mirroring an outward-pointing camera would invert any text the
// user holds up, which is the opposite of helpful.
//
// `getSettings()` is the standard MediaStreamTrack API and is widely
// supported in modern browsers; we still wrap it in try/catch because
// older Safari builds throw on certain track flavours (screen capture,
// captureStream from canvas, etc.) — in those cases we err toward
// mirroring, which is the common case.
export default function shouldMirrorVideoTrack(track: MediaStreamTrack | undefined | null): boolean {
  if(!track || track.kind !== 'video') return false;
  try {
    return track.getSettings()?.facingMode !== 'environment';
  } catch(_) {
    return true;
  }
}
