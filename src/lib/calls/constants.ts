export const GROUP_CALL_AMPLITUDE_ANALYSE_COUNT_MAX = 50;
export const GROUP_CALL_AMPLITUDE_ANALYSE_INTERVAL_MS = 100;
export const GROUP_CALL_PARTICIPANTS_LOAD_LIMIT = 100;
// Enough to name a few people in the conference join confirmation and still
// know there are more — the same page size tdesktop asks for there
// (window_session_controller.cpp:985).
export const CONFERENCE_PREVIEW_PARTICIPANTS_LIMIT = 5;

export const enum GroupCallVideoQuality {
  Thumbnail = 0,
  Medium = 1,
  Full = 2
};

export const RTMP_UNIFIED_CHANNEL_ID = 1;
export const RTMP_UNIFIED_QUALITY = GroupCallVideoQuality.Full;

// TdE2E per-frame encryption channel ids (see e2e/call.ts encrypt/decrypt).
// Each distinct outgoing stream gets its own channel so their per-(sender,
// channel) replay windows don't contend. The main connection's audio + camera
// video share channel 0; the screen-share (presentation) connection's video
// gets its own channel. NB: unrelated to RTMP_UNIFIED_CHANNEL_ID above, which
// is an SFU media channel, not an e2e channel.
export const E2E_MAIN_CHANNEL_ID = 0;
export const E2E_SCREENCAST_CHANNEL_ID = 1;

// Inbound 1-on-1 signaling is gzipped by the peer (tgcalls 13.0.0). Bound the
// inflated size the way tgcalls does (InstanceV2Impl.cpp gunzipData, 2 MiB) so
// an authenticated peer cannot turn a 1 MiB packet into a gigabyte in the tab.
export const P2P_SIGNALING_MAX_INFLATED_BYTES = 2 * 1024 * 1024;

// How long a call may ring before it is given up on — the 1-on-1 request /
// accept window and, for want of the server's `call_ring_timeout_ms`, the age
// past which an incoming conference invitation is no longer offered.
export const CALL_REQUEST_TIMEOUT = 45e3;
