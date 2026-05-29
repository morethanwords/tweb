// TdE2E-encrypted conference calls. The full client-side port lives under
// src/lib/calls/e2e/ and is byte-compatible with tdlib's reference.
//
// Previously GATED off because of an apparent Chrome `RTCRtpScriptTransform`
// recv-side bypass ("~5 frames then halt"). That was re-diagnosed as a
// MODEL + TIMING bug, not a Chromium limitation: the recv path had been
// built around a single multiplexed recvonly m-line and attached the recv
// transform in the `track` event (after the decoder binds — too late, so
// Chrome silently bypasses it). It now mints one recvonly m-line per remote
// SSRC (like legacy voice chats — the SFU signals only SSRCs) and attaches
// the recv transform at createTransceiver time, before the decoder binds —
// the exact mirror of the proven send-side fix. See onParticipantUpdate in
// groupCallInstance.ts + joinConferenceCommon in groupCallsController.ts.
//
// Enabled so the fix can be verified end-to-end on a live 2-party
// conference. If recv frames still don't pump through the transform, gate
// this back to `false` while investigating.
const IS_CONFERENCE_CALL_SUPPORTED = true;

export default IS_CONFERENCE_CALL_SUPPORTED;
