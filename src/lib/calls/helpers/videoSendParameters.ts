import updateSenderParameters, {preferScreencastResolution} from '@lib/calls/helpers/updateSenderParameters';

/**
 * Outgoing group-call video: how many simulcast layers to send and how to
 * configure each one, mirroring tgcalls (group/GroupInstanceCustomImpl.cpp,
 * generateSsrcs + adjustVideoSendParams + the SenderVideoConstraints handler).
 *
 * The layer count is baked into the SDP offer (sdp/utils.ts addSimulcast) and
 * cannot change afterwards, so it is decided per connection. The per-layer
 * bitrate/scale/active values are applied with RTCRtpSender.setParameters —
 * verified in Chromium 149 against an SSRC-group-munged offer: N `SIM` members
 * give N encodings in group order (lowest resolution first), and
 * `active: false` / `maxBitrate` / `scaleResolutionDownBy` on them are accepted
 * and take effect without renegotiation.
 */

export type VideoSendContent = 'camera' | 'screencast';

// The SFU asks for this height (idealHeight) through SenderVideoConstraints.
// tgcalls starts at 720 — every layer active — until told otherwise.
export const DEFAULT_SENDER_VIDEO_CONSTRAINT = 720;
// A lower request only takes effect if it still holds this long later; a
// higher one applies at once (tgcalls: PostDelayedTask 2000 ms).
export const SENDER_VIDEO_CONSTRAINT_DOWNGRADE_DELAY_MS = 2000;

type VideoLayer = {
  maxBitrate: number,
  scaleResolutionDownBy?: number,
  // The layer is sent only while the SFU's requested height reaches this.
  minConstraint?: number
};

// tgcalls adjustVideoSendParams, for the layer counts getVideoSimulcastLayerCount
// produces (camera 3, screencast 2, either 1 in a conference). Its
// min_bitrate_bps has no web counterpart.
const VIDEO_LAYERS: Record<VideoSendContent, {[layers: number]: VideoLayer[]}> = {
  camera: {
    3: [
      {maxBitrate: 60000, scaleResolutionDownBy: 4, minConstraint: 180},
      {maxBitrate: 110000, scaleResolutionDownBy: 2, minConstraint: 360},
      {maxBitrate: 900000, scaleResolutionDownBy: 1, minConstraint: 720}
    ],
    1: [{maxBitrate: 1800000}]
  },
  screencast: {
    2: [
      {maxBitrate: 100000, scaleResolutionDownBy: 2},
      {maxBitrate: 1000000, scaleResolutionDownBy: 1}
    ],
    1: [{maxBitrate: 1800000}]
  }
};

/**
 * tgcalls generateSsrcs: a conference (E2E) call sends one layer — every frame
 * of every layer would be encrypted separately — a screencast two, a camera
 * three.
 */
export function getVideoSimulcastLayerCount(content: VideoSendContent, isConference: boolean): number {
  if(isConference) return 1;
  return content === 'screencast' ? 2 : 3;
}

/**
 * Write the layer configuration for `constraint` into `encodings` (in place).
 * Returns whether anything changed, so an unchanged sender is not touched.
 */
export function configureVideoSendEncodings(
  encodings: RTCRtpEncodingParameters[],
  content: VideoSendContent,
  constraint: number
): boolean {
  const layers = VIDEO_LAYERS[content][encodings?.length];
  if(!layers) {
    return false;
  }

  let changed = false;
  layers.forEach((layer, index) => {
    const encoding = encodings[index];
    const active = layer.minConstraint === undefined || constraint >= layer.minConstraint;
    if(encoding.active !== active) {
      encoding.active = active;
      changed = true;
    }

    if(encoding.maxBitrate !== layer.maxBitrate) {
      encoding.maxBitrate = layer.maxBitrate;
      changed = true;
    }

    if(layer.scaleResolutionDownBy !== undefined && encoding.scaleResolutionDownBy !== layer.scaleResolutionDownBy) {
      encoding.scaleResolutionDownBy = layer.scaleResolutionDownBy;
      changed = true;
    }
  });

  return changed;
}

/**
 * Apply the layer configuration (and, for a screencast, the
 * maintain-resolution preference) to a live sender. Must not overlap another
 * setParameters on the same sender — callers serialize.
 */
export function applyVideoSendParameters(
  sender: RTCRtpSender,
  content: VideoSendContent,
  constraint: number
): Promise<boolean> {
  return updateSenderParameters(sender, (parameters) => {
    if(!parameters.encodings?.length) {
      return false;
    }

    const changed = configureVideoSendEncodings(parameters.encodings, content, constraint);
    return (content === 'screencast' && preferScreencastResolution(parameters)) || changed;
  });
}

/**
 * The SFU's SenderVideoConstraints with tgcalls' hysteresis: a higher height
 * applies immediately, a lower one only if no other request replaced it within
 * the downgrade delay, so a viewer briefly shrinking a tile does not make the
 * top layer stop and restart (a fresh keyframe each time).
 */
export class SenderVideoConstraint {
  public value = DEFAULT_SENDER_VIDEO_CONSTRAINT;
  private pendingTimer: number | undefined;

  constructor(
    private onChange: (value: number) => void,
    private downgradeDelayMs = SENDER_VIDEO_CONSTRAINT_DOWNGRADE_DELAY_MS
  ) {}

  public request(height: number) {
    if(!Number.isFinite(height) || height < 0) {
      return;
    }

    if(height === this.value) {
      // tgcalls keeps an older pending downgrade alive here; the latest request
      // is what the SFU wants now, so it cancels it.
      this.cancelPending();
      return;
    }

    if(height < this.value) {
      this.cancelPending();
      this.pendingTimer = window.setTimeout(() => {
        this.pendingTimer = undefined;
        this.set(height);
      }, this.downgradeDelayMs);
      return;
    }

    this.cancelPending();
    this.set(height);
  }

  public dispose() {
    this.cancelPending();
  }

  private set(height: number) {
    if(this.value === height) return;
    this.value = height;
    this.onChange(height);
  }

  private cancelPending() {
    if(this.pendingTimer !== undefined) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = undefined;
    }
  }
}
