export const GROUP_CALL_AMPLITUDE_ANALYSE_COUNT_MAX = 50;
export const GROUP_CALL_AMPLITUDE_ANALYSE_INTERVAL_MS = 100;
export const GROUP_CALL_PARTICIPANTS_LOAD_LIMIT = 100;

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
