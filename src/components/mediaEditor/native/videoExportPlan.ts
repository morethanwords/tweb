import type {VideoSourceInfo} from '@helpers/video/readVideoSourceInfo';
import {resolveNativeVideoQualityV1, roundDesktopVideoDimensionV1, type NativeVideoQualitySelectionV1, type VideoQualitySize} from '@components/mediaEditor/native/videoQualityPolicy';

/** References below are to these immutable sources, not current upstream HEAD.
 * Desktop a532622be61ffb811c34311583c9fd4828786833, media/media_video_encode.cpp:
 * 32–33,80–87 (bitrate), 1604–1668 (geometry), 2063–2102 (FPS/copy),
 * 2151–2157 (source cap), 2204–2234 (audio; MP3 minimum at line 49).
 * Android 21f7d109da6ab3506c9e9577f98c6a38771ab335:
 * ui/PhotoViewer.java:21449–21528 (geometry/base bitrate vs calibration),
 * messenger/MediaController.java:7244–7261,7348–7415 (FPS/float bitrate/calibration),
 * messenger/video/MediaCodecVideoConvertor.java:421–423,561–603 (source cap/audio).
 * Ordinary MP4 video only: no avatar, GIF, WebM, HDR, sound mixing or silent fill.
 * This is a decision API, not an encoder config or a promise of decoded fidelity.
 * Policy arithmetic is pinned; its inputs are demux facts/packet estimates, NOT
 * a claim that Mediabunny's probe equals FFmpeg/MediaExtractor's source probe.
 * Decode/source-file resource budgets remain the consumer's responsibility.
 */
export type NativeVideoSupport = 'supported' | 'unsupported' | 'unknown';
export type NativeVideoEncodeRequest = {
  codec: 'avc';
  size: VideoQualitySize;
  fps: number;
  bitrate: number;
};
export type NativeVideoExportInput = {
  selection: NativeVideoQualitySelectionV1;
  source: VideoSourceInfo;
  geometry: {
    crop: 'none' | 'edited';
    userRotation: number;
    flipped: boolean;
  };
  /** Caller facts, not inferred from the legacy numeric output height. */
  changes: {qualityClicked: boolean; trimmed: boolean; visualEdits: boolean};
  audio: 'keep' | 'mute';
  fpsPolicy: {kind: 'desktop'; limit: number} | {kind: 'android'; shouldLimitFps: boolean};
  capabilities: {
    /** Must describe this source/container, not just a codec family. */
    passthrough: NativeVideoSupport;
    videoCopy: NativeVideoSupport;
    audioCopy: NativeVideoSupport;
    /** Pure lookup for the EXACT tuple. No dimension/bitrate clamping allowed. */
    videoEncode: (request: NativeVideoEncodeRequest) => NativeVideoSupport;
  };
};
export type NativeVideoAudioPlan =
  | {action: 'omit'; sourceStatus: VideoSourceInfo['audio']['status']; reason: 'muted' | 'absent'}
  | {action: 'copy'; sourceStatus: 'present'}
  | {action: 'unavailable'; sourceStatus: 'unknown' | 'present'; reason: 'audio-presence' | 'audio-codec' | 'audio-sample-rate'}
  | {action: 'unsupported'; sourceStatus: 'present'; reason: 'audio-transcode-contract'};

export type NativeVideoPlanCandidate = {
  /** Literal chooser result, including odd/zero/negative native anomalies. */
  choiceSize: VideoQualitySize;
  encoderSize: VideoQualitySize;
  outputRotation: 0 | 90 | 180 | 270;
  rotationHandling: 'preserve-metadata' | 'bake-metadata';
  audio: NativeVideoAudioPlan;
  fps?: {value: number; sourceProvenance: NonNullable<VideoSourceInfo['fps']>['provenance']};
  bitrate?: {base: number; encoderTarget: number; calibration: 'not-required' | 'unsupportednativecalibration'};
};
export type NativeVideoPlanReason =
  | 'source-color'
  | 'unsupportedcrop' | 'native-bake-contract' | 'source-geometry' | 'fps-policy-style'
  | 'source-display-geometry' | 'native-display-contract' | 'quality-selection' | 'native-dimensions'
  | 'audio-presence' | 'audio-codec' | 'audio-sample-rate' | 'audio-transcode-contract'
  | 'source-fps' | 'fps-limit' | 'android-integer-fps-contract' | 'source-bitrate'
  | 'android-int-bitrate-contract' | 'native-bitrate' | 'video-encode-capability'
  | 'audio-copy-capability' | 'unsupportednativecalibration';
type NativeVideoEncodeCandidate = NativeVideoPlanCandidate & {
  fps: NonNullable<NativeVideoPlanCandidate['fps']>;
  bitrate: NonNullable<NativeVideoPlanCandidate['bitrate']>;
};
export type NativeVideoExportPlan = {
  selection: NativeVideoQualitySelectionV1;
} & (
  | {status: 'ready'; action: 'passthrough' | 'remux'; candidate: NativeVideoPlanCandidate}
  | {status: 'ready'; action: 'encode'; candidate: NativeVideoEncodeCandidate}
  | {status: 'unavailable' | 'unsupported'; reason: NativeVideoPlanReason; candidate?: NativeVideoPlanCandidate}
);

const positive = (value: number) => Number.isFinite(value) && value > 0;
const pixel = (value: number) => Number.isInteger(value) && value > 0 && value <= 2147483647;
const transpose = (size: VideoQualitySize): VideoQualitySize => [size[1], size[0]];

function audioPlan(source: VideoSourceInfo, mode: NativeVideoExportInput['audio'], desktop: boolean): NativeVideoAudioPlan {
  const audio = source.audio;
  if(mode === 'mute') return {action: 'omit', sourceStatus: audio.status, reason: 'muted'};
  if(audio.status === 'absent') return {action: 'omit', sourceStatus: 'absent', reason: 'absent'};
  if(audio.status !== 'present') return {action: 'unavailable', sourceStatus: 'unknown', reason: 'audio-presence'};
  if(!audio.codec) return {action: 'unavailable', sourceStatus: 'present', reason: 'audio-codec'};
  if(desktop && audio.codec === 'mp3' && !positive(audio.sampleRate)) {
    return {action: 'unavailable', sourceStatus: 'present', reason: 'audio-sample-rate'};
  }
  if(audio.codec === 'aac' || (audio.codec === 'mp3' && (!desktop || audio.sampleRate >= 16000))) {
    return {action: 'copy', sourceStatus: 'present'};
  }
  // Native clients transcode here. Their resampling/channel/encoder contract
  // is not ported by this bounded video-quality plan; never silently drop audio.
  return {action: 'unsupported', sourceStatus: 'present', reason: 'audio-transcode-contract'};
}

/** Java float operations round after EACH operation; int casts saturate/truncate. */
function androidBaseBitrate(sourceSize: VideoQualitySize, size: VideoQualitySize, bitrate: number) {
  const f = Math.fround;
  const int = (value: number) => Math.trunc(Math.max(-2147483648, Math.min(2147483647, value)));
  const shorter = Math.min(...size);
  const [max, compress, minCompress] = shorter >= 1080 ? [6800000, 1, 1] :
    shorter >= 720 ? [2600000, 1, 1] : shorter >= 480 ? [1000000, .75, .9] : [750000, .6, .7];
  const ratio = Math.min(f(f(sourceSize[1]) / f(size[1])), f(f(sourceSize[0]) / f(size[0])));
  let remeasured = int(f(f(bitrate) / ratio));
  remeasured = int(f(f(remeasured) * f(compress)));
  const factorBitrate = int(f(f(f(f(minCompress) * f(2000)) * f(1000)) * f(1.13)));
  // Java width*height is a signed int, not a float or a JS safe-integer product.
  const area = Math.imul(size[0], size[1]);
  const minimum = int(f(f(factorBitrate) / f(f(f(1280) * f(720)) / f(area))));
  if(bitrate < minimum) return remeasured;
  if(remeasured > max) return max;
  return Math.max(remeasured, minimum);
}

export default function planNativeVideoExportV1(input: NativeVideoExportInput): NativeVideoExportPlan {
  const {selection, source, geometry, changes, capabilities} = input;
  const stop = (status: 'unavailable' | 'unsupported', reason: NativeVideoPlanReason, candidate?: NativeVideoPlanCandidate): NativeVideoExportPlan =>
    ({selection, status, reason, candidate});
  if(geometry.crop !== 'none') return stop('unsupported', 'unsupportedcrop');
  if(geometry.userRotation !== 0 || geometry.flipped || changes.visualEdits) return stop('unsupported', 'native-bake-contract');
  if(source.color?.status !== 'sdr') return stop(source.color?.status === 'hdr' ? 'unsupported' : 'unavailable', 'source-color');
  if(!pixel(source.codedWidth) || !pixel(source.codedHeight) || source.rotation === undefined) return stop('unavailable', 'source-geometry');
  const desktop = selection.nativeStyle === 'desktop';
  if(input.fpsPolicy.kind !== selection.nativeStyle) return stop('unsupported', 'fps-policy-style');
  const coded: VideoQualitySize = [source.codedWidth, source.codedHeight];
  const swap = source.rotation === 90 || source.rotation === 270;
  const display = swap ? transpose(coded) : coded;
  // Sample aspect ratio/display resizing is not PlanGeometry's rotation contract.
  if(source.displayWidth === undefined || source.displayHeight === undefined) return stop('unavailable', 'source-display-geometry');
  if(source.displayWidth !== display[0] || source.displayHeight !== display[1]) return stop('unsupported', 'native-display-contract');
  const choiceSize = resolveNativeVideoQualityV1(selection, {sourceSize: coded, editedSize: display});
  if(!choiceSize) return stop('unsupported', 'quality-selection');
  // Desktop's Original chooser shows verbatim dimensions, but PlanDisplayGeometry
  // applies EvenSize. Android's chooser already includes its literal anomaly.
  const target: VideoQualitySize = desktop ? [roundDesktopVideoDimensionV1(choiceSize[0]), roundDesktopVideoDimensionV1(choiceSize[1])] : choiceSize;
  const encoderSize = swap ? transpose(target) : target;
  const candidate: NativeVideoPlanCandidate = {
    choiceSize, encoderSize, outputRotation: desktop ? source.rotation : 0,
    rotationHandling: desktop ? 'preserve-metadata' : 'bake-metadata',
    audio: audioPlan(source, input.audio, desktop)
  };
  if(!encoderSize.every(pixel)) return stop('unsupported', 'native-dimensions', candidate);
  if(candidate.audio.action === 'unavailable' || candidate.audio.action === 'unsupported') {
    return stop(candidate.audio.action, candidate.audio.reason, candidate);
  }
  const sourceFps = source.fps?.value;
  if(!positive(sourceFps)) return stop('unavailable', 'source-fps', candidate);
  let fps: number;
  let limiting: boolean;
  if(input.fpsPolicy.kind === 'desktop') {
    const limit = input.fpsPolicy.limit;
    if(!Number.isFinite(limit) || limit < 0) return stop('unsupported', 'fps-limit', candidate);
    limiting = limit > 0 && sourceFps > limit * 1.05;
    const raw = limiting ? limit : sourceFps;
    // Native SanitizedFps fallback applies only to a KNOWN value, never unknown.
    fps = raw > 1 && raw < 121 ? raw : 30;
  } else {
    // Native info.framerate is an int. A packet estimate is not that integer
    // metadata field: fractional estimates need an explicit future contract.
    if(!Number.isInteger(sourceFps)) return stop('unsupported', 'android-integer-fps-contract', candidate);
    fps = Math.min(sourceFps, 59);
    if(!input.fpsPolicy.shouldLimitFps && fps > 40 && Math.min(...encoderSize) <= 480) fps = 30;
    limiting = fps !== sourceFps;
  }
  candidate.fps = {value: fps, sourceProvenance: source.fps.provenance};
  const sameSize = encoderSize[0] === coded[0] && encoderSize[1] === coded[1];
  const copyVideo = sameSize && !changes.trimmed && !limiting &&
    (source.codec === 'avc' || source.codec === 'hevc') && (desktop || source.rotation === 0);
  // Web integration guard: an explicit click must not return the old blob just
  // because the chosen resolution matches it. Native remux is a separate action.
  const unchangedAudio = input.audio === 'keep' || source.audio.status === 'absent';
  if(copyVideo && !changes.qualityClicked && unchangedAudio && capabilities.passthrough === 'supported') {
    return {selection, status: 'ready', action: 'passthrough', candidate};
  }
  if(copyVideo && capabilities.videoCopy === 'supported' &&
    (candidate.audio.action !== 'copy' || capabilities.audioCopy === 'supported')) {
    return {selection, status: 'ready', action: 'remux', candidate};
  }
  if(!positive(source.videoBitrate)) return stop('unavailable', 'source-bitrate', candidate);
  if(!desktop && (!Number.isInteger(source.videoBitrate) || source.videoBitrate > 2147483647)) return stop('unsupported', 'android-int-bitrate-contract', candidate);
  const androidKeepsSize = choiceSize[0] === coded[0] && choiceSize[1] === coded[1];
  const base = desktop ? Math.trunc(Math.max(600000, Math.min(6800000, encoderSize[0] * encoderSize[1] * fps * .07))) :
    androidKeepsSize ? source.videoBitrate : androidBaseBitrate(coded, choiceSize, source.videoBitrate);
  candidate.bitrate = {
    base, encoderTarget: Math.min(base, source.videoBitrate),
    calibration: desktop ? 'not-required' : 'unsupportednativecalibration'
  };
  if(!positive(base)) return stop('unsupported', 'native-bitrate', candidate);
  const support = capabilities.videoEncode({codec: 'avc', size: encoderSize, fps, bitrate: candidate.bitrate.encoderTarget});
  if(support !== 'supported') return stop(support === 'unknown' ? 'unavailable' : 'unsupported', 'video-encode-capability', candidate);
  if(candidate.audio.action === 'copy' && capabilities.audioCopy !== 'supported') {
    return stop(capabilities.audioCopy === 'unknown' ? 'unavailable' : 'unsupported', 'audio-copy-capability', candidate);
  }
  if(!desktop) return stop('unsupported', 'unsupportednativecalibration', candidate);
  return {selection, status: 'ready', action: 'encode', candidate: {...candidate, fps: candidate.fps, bitrate: candidate.bitrate}};
}
