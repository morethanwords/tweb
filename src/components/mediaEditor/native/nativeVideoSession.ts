import {batch, createEffect, createSignal, onCleanup} from 'solid-js';
import {unwrap} from 'solid-js/store';
import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import type {useCropOffset} from '@components/mediaEditor/canvas/useCropOffset';
import getResultTransform from '@components/mediaEditor/finalRender/getResultTransform';
import {createNativeVideoEncoderSupport} from '@components/mediaEditor/support';
import readVideoSourceInfo, {type VideoSourceInfo} from '@helpers/video/readVideoSourceInfo';
import {getAndroidVideoQualityChoicesV1, getDesktopVideoQualityChoicesV1, type NativeVideoQualityChoiceV1, type NativeVideoQualitySelectionV1} from '@components/mediaEditor/native/videoQualityPolicy';
import planNativeVideoExportV1, {type NativeVideoExportInput, type NativeVideoExportPlan} from '@components/mediaEditor/native/videoExportPlan';

export type NativeVideoDecision = {
  status: 'ready';
  plan: Extract<NativeVideoExportPlan, {action: 'encode'}>;
  config: VideoEncoderConfig;
  source: VideoSourceInfo;
} | {status: 'unavailable' | 'unsupported'; reason: string};
export type NativeVideoOption = {choice: NativeVideoQualityChoiceV1; decision: NativeVideoDecision};

export function nativeVideoSelectionKey(selection: NativeVideoQualitySelectionV1) {
  return JSON.stringify(selection);
}

/** One atomic root history entry; the legacy output-height field is never read or written. */
export function selectNativeVideoQuality(context: MediaEditorContextValue, selection: NativeVideoQualitySelectionV1) {
  const previous = context.mediaState.nativeVideoQuality;
  if(nativeVideoSelectionKey(previous) === nativeVideoSelectionKey(selection)) return;
  const next = structuredClone(unwrap(selection));
  batch(() => {
    context.actions.pushToHistory({path: ['nativeVideoQuality'], oldValue: previous && structuredClone(unwrap(previous)), newValue: structuredClone(next)});
    context.mediaState.nativeVideoQuality = next;
  });
}

/** Shared by the quality UI and export. No viewport reads or numeric-height migration.
 * This consumer intentionally supports only encode + absent/omitted audio. Native
 * copy/remux, crop, metadata rotation and audio transcode remain unavailable here.
 */
export default function createNativeVideoSession(context: MediaEditorContextValue, style: NativeVideoQualitySelectionV1['nativeStyle'], cropOffset: ReturnType<typeof useCropOffset>) {
  const support = createNativeVideoEncoderSupport();
  const abort = new AbortController();
  let disposed = false;
  onCleanup(() => { disposed = true; abort.abort(); });
  const [source, setSource] = createSignal<VideoSourceInfo>();
  const [options, setOptions] = createSignal<NativeVideoOption[]>([]);
  const [selected, setSelected] = createSignal<NativeVideoDecision>();
  // Opt in explicitly to a hard 64-fetch estimate; cache this one promise for
  // the editor lifetime. It never holds up ImageCanvas or editor readiness.
  const metadata = Promise.resolve().then(() => context.getMediaBlob()).then(blob =>
    blob ? readVideoSourceInfo(blob, {fpsProbePacketCount: 64, signal: abort.signal}) : {audio: {status: 'unknown'}} as VideoSourceInfo
  ).catch((): VideoSourceInfo => ({audio: {status: 'unknown'}}));
  void metadata.then(info => { if(!disposed) setSource(info); });

  function snapshot() {
    const {mediaState: state, editorState: editor} = context;
    const media = editor.renderingPayload?.media;
    const sizeReady = media && editor.canvasSize && cropOffset().width;
    const transform = sizeReady && getResultTransform({context, scaledWidth: media.width, scaledHeight: media.height, imageWidth: media.width, imageHeight: media.height, cropOffset});
    const near = (value: number, target: number) => Math.abs(value - target) < .000001;
    const noCrop = transform && near(transform.scale, 1) && transform.translation.every(value => near(value, 0)) && near(state.currentImageRatio, media.width / media.height);
    return {
      geometryReady: !!sizeReady,
      geometry: {crop: noCrop ? 'none' as const : 'edited' as const, userRotation: state.rotation, flipped: state.flip.some(value => value !== 1)},
      changes: {
        qualityClicked: true,
        trimmed: state.videoCropStart !== 0 || state.videoCropLength !== 1,
        visualEdits: !!state.resizableLayers.length || !!state.brushDrawnLines.length ||
          Object.values(state.adjustments).some(value => typeof value === 'number' ? value !== 0 : value !== undefined)
      },
      audio: state.videoMuted ? 'mute' as const : 'keep' as const
    };
  }

  async function decide(selection: NativeVideoQualitySelectionV1, state: ReturnType<typeof snapshot>, info: VideoSourceInfo): Promise<NativeVideoDecision> {
    if(style === 'android') return {status: 'unsupported', reason: 'unsupportednativecalibration'};
    if(info.color?.status !== 'sdr') return {status: info.color?.status === 'hdr' ? 'unsupported' : 'unavailable', reason: 'source-color'};
    if(!state.geometryReady) return {status: 'unavailable', reason: 'source-geometry'};
    if(info.rotation !== 0) return {status: info.rotation === undefined ? 'unavailable' : 'unsupported', reason: 'source-rotation'};
    if(!Number.isFinite(info.duration) || info.duration <= 0) return {status: 'unavailable', reason: 'source-duration'};
    if(state.changes.trimmed) return {status: 'unsupported', reason: 'native-trim-contract'};
    if(state.audio === 'keep' && info.audio.status === 'present') return {status: 'unsupported', reason: 'audio-copy-contract'};
    const policy: NativeVideoExportInput = {
      selection, source: info, geometry: state.geometry, changes: state.changes, audio: state.audio,
      // Android returned above: no network/preference default is invented here.
      fpsPolicy: {kind: 'desktop', limit: 0},
      capabilities: {passthrough: 'unsupported', videoCopy: 'unsupported', audioCopy: 'unsupported', videoEncode: () => 'unknown'}
    };
    const draft = planNativeVideoExportV1(policy);
    const candidate = draft.candidate;
    if(!candidate?.fps || !candidate.bitrate || draft.status === 'ready' || draft.reason !== 'video-encode-capability') {
      return {status: draft.status === 'unavailable' ? 'unavailable' : 'unsupported', reason: draft.status === 'ready' ? 'native-copy-contract' : draft.reason};
    }
    const config = await support({codec: 'avc', size: candidate.encoderSize, fps: candidate.fps.value, bitrate: candidate.bitrate.encoderTarget});
    if(!config) return {status: 'unsupported', reason: 'video-encode-capability'};
    const plan = planNativeVideoExportV1({...policy, capabilities: {...policy.capabilities, videoEncode: () => 'supported'}});
    if(plan.status !== 'ready' || plan.action !== 'encode' || plan.candidate.audio.action !== 'omit') {
      return {status: 'unsupported', reason: plan.status === 'ready' ? 'audio-copy-contract' : plan.reason};
    }
    return {status: 'ready', plan, config, source: info};
  }

  let revision = 0;
  createEffect(() => {
    const info = source();
    const state = snapshot();
    const selection = context.mediaState.nativeVideoQuality && structuredClone(unwrap(context.mediaState.nativeVideoQuality));
    const current = ++revision;
    setSelected(selection ? {status: 'unavailable', reason: 'checking'} : undefined);
    if(!info) return;
    const size = [info.codedWidth, info.codedHeight] as const;
    const choices = style === 'desktop' ? getDesktopVideoQualityChoicesV1(size) : getAndroidVideoQualityChoicesV1(size);
    setOptions(choices.map((choice): NativeVideoOption => ({choice, decision: {status: 'unavailable', reason: 'checking'}})));
    void Promise.all(choices.map(async choice => ({choice, decision: await decide(choice.selection, state, info)}))).then(results => {
      if(disposed || current !== revision) return;
      setOptions(results);
    });
    if(selection) void decide(selection, state, info).then(result => {
      if(!disposed && current === revision) setSelected(result);
    });
  });

  return {
    style, source, options, selected,
    select(selection: NativeVideoQualitySelectionV1) {
      const option = options().find(option => nativeVideoSelectionKey(option.choice.selection) === nativeVideoSelectionKey(selection));
      if(option?.decision.status !== 'ready') return false;
      selectNativeVideoQuality(context, selection);
      return true;
    },
    async resolveForExport(): Promise<NativeVideoDecision> {
      const selection = structuredClone(unwrap(context.mediaState.nativeVideoQuality));
      const state = snapshot();
      const before = JSON.stringify({selection, state});
      const info = await metadata;
      const decision = await decide(selection, state, info);
      if(disposed || before !== JSON.stringify({selection: context.mediaState.nativeVideoQuality, state: snapshot()})) return {status: 'unavailable', reason: 'state-changed'};
      setSelected(decision);
      return decision;
    }
  };
}
