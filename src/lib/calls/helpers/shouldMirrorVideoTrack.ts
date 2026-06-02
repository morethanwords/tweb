// Decide whether a `<video>` element backed by a given track should get the
// `.call-video-mirror` class. Front-facing ("user") and unspecified-facing
// tracks read as a mirror (selfie expectation: pat hair on the correct side);
// rear-facing ("environment") tracks render in their native orientation
// because mirroring an outward-pointing camera would invert any text the
// user holds up, which is the opposite of helpful.
//
// Screen / window / tab capture (getDisplayMedia, identifiable by
// `displaySurface`) is NEVER mirrored: it isn't a selfie, and flipping it
// would reverse any text on the shared screen. Such tracks carry no
// `facingMode`, so without this check they'd fall through to the
// "unspecified → mirror" default and come out backwards.
//
// `getSettings()` is the standard MediaStreamTrack API and is widely
// supported in modern browsers; we still wrap it in try/catch because
// older Safari builds throw on certain track flavours (screen capture,
// captureStream from canvas, etc.) — in those cases we err toward
// mirroring, which is the common case.
export default function shouldMirrorVideoTrack(track: MediaStreamTrack | undefined | null): boolean {
  if(!track || track.kind !== 'video') return false;

  let facingMode: string | undefined;
  try {
    const settings = track.getSettings();
    if((settings as {displaySurface?: string})?.displaySurface) return false;
    facingMode = settings?.facingMode;
  } catch(_) {}

  // `getSettings().facingMode` is the spec signal, but iOS Safari leaves it
  // EMPTY when the camera was opened by `deviceId` (exact) instead of a
  // `facingMode` constraint — which is exactly how the Speakers-and-Camera
  // picker and an in-call device swap open it. So a rear camera picked from
  // the list would fall through to the "unspecified → mirror" selfie default
  // and come out backwards. Recover the facing from `getCapabilities()` (its
  // `facingMode` is an array of the camera's supported modes; a physical
  // camera advertises exactly one)…
  if(!facingMode) {
    try {
      facingMode = track.getCapabilities?.()?.facingMode?.[0];
    } catch(_) {}
  }

  // …and finally from the human-readable label, the most reliable rear signal
  // on the platforms that actually have two cameras: iOS ("Back Camera") and
  // Android Chrome ("camera2 0, facing back"). Desktop webcams advertise no
  // direction in their label, so they keep falling through to the mirror
  // default below — no regression for laptop FaceTime/USB cams.
  if(!facingMode && /\b(back|rear)\b/i.test(track.label || '')) return false;

  return facingMode !== 'environment';
}
