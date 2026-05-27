// TdE2E-encrypted conference calls. The full client-side port lives under
// src/lib/calls/e2e/ and is byte-compatible with tdlib's reference, but the
// UI entry points are GATED off because of a Chrome `RTCRtpScriptTransform`
// recv-side bypass that only fires for Telegram's single-mid SFU layout —
// see docs/conf-call-browser-recv-blocker.md for the full writeup,
// reproduction, and the proposed server-side fix.
//
// Flip this to `true` to re-enable the UI once the SFU exposes a multi-mid
// layout to browser clients (or once the Chromium bug is fixed). All the
// backend (crypto, blockchain, worker, transform attach, audio trailer,
// SDP munging) is already wired up — only the user-facing entry points
// are gated.
const IS_CONFERENCE_CALL_SUPPORTED = false;

export default IS_CONFERENCE_CALL_SUPPORTED;
