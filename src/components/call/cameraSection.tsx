import {createEffect, createMemo, createSignal, on, onCleanup, onMount, Show} from 'solid-js';
import Section from '@components/section';
import {i18n} from '@lib/langPack';
import acquireStream, {StreamAcquisition} from '@lib/calls/helpers/acquireStream';
import shouldMirrorVideoTrack from '@lib/calls/helpers/shouldMirrorVideoTrack';
import classNames from '@helpers/string/classNames';
import {CallDeviceRow, CallDeviceSettings} from '@components/call/callDeviceSettings';

// Self-contained "Camera" section used by both the in-call settings popup
// and the Speakers-and-Camera settings tab. Owns its own preview MediaStream
// — acquired on mount, released on unmount, re-acquired when the persisted
// cameraId changes — so neither callsite has to plumb cleanup itself.
//
// When `getUserMedia({video})` fails (no permission, no device), the preview
// block is suppressed via `previewError`. The picker row stays visible so
// the user can still pick a different device.
export default function CallCameraSection(props: {settings: CallDeviceSettings}) {
  const [previewStream, setPreviewStream] = createSignal<MediaStream | undefined>(undefined);
  const [previewError, setPreviewError] = createSignal(false);

  let videoEl: HTMLVideoElement | undefined;

  // Holds the in-flight / active camera acquire so we can dispose() it — that
  // stops the stream even if getUserMedia resolves AFTER the popup closes or the
  // camera is switched (getUserMedia can't be cancelled, so without this the
  // camera light would stay on forever). See acquireStream.
  let acquisition: StreamAcquisition | undefined;

  const stopPreview = () => {
    // dispose() owns the stream's tracks (stops the in-flight one too); clear the
    // signal so the <video> detaches.
    acquisition?.dispose();
    acquisition = undefined;
    setPreviewStream(undefined);
  };

  // (Re)acquire the camera preview using the persisted choice. We avoid
  // explicit constraints on the "Default" path so the browser picks the
  // OS-preferred camera with the user's existing permission, instead of
  // failing with NotFoundError on a freshly removed device. Stale-id
  // recovery lives inside `getStream`.
  const startPreview = async() => {
    stopPreview();
    const id = props.settings.deviceId('camera');
    const current = acquisition = acquireStream({
      video: id ? {deviceId: {exact: id}} : true
    });
    try {
      const stream = await current.promise;
      // Disposed (popup closed / camera switched) while getUserMedia resolved —
      // dispose() already stopped the orphaned stream; nothing to show.
      if(!stream) return;
      setPreviewStream(stream);
      setPreviewError(false);
    } catch(err) {
      // A disposed acquire resolves undefined, so only a real, still-wanted
      // error reaches here.
      console.error('camera preview failed', err);
      setPreviewError(true);
    }
  };

  onMount(() => {
    startPreview();
    onCleanup(() => {
      // Disposes a startPreview() still awaiting getUserMedia so its stream is
      // stopped when it resolves, rather than leaking it past unmount.
      stopPreview();
    });
  });

  // Re-spin the preview whenever the persisted cameraId changes — keeps the
  // <video> in sync with the picker without manual wiring.
  createEffect(on(() => props.settings.deviceId('camera'), () => {
    startPreview();
  }, {defer: true}));

  // Attach the preview stream to the <video> reactively. Setting srcObject
  // mid-stream is allowed and cheap; the browser switches frames on vsync.
  createEffect(() => {
    const stream = previewStream();
    if(videoEl) {
      videoEl.srcObject = stream || null;
    }
  });

  // Reactively decide whether to apply the mirror class — front-facing
  // (selfie) preview gets flipped, rear-facing stays in native orientation.
  // Driven by the current previewStream so a mid-tab device swap re-evaluates
  // without forcing a remount of the <video> element.
  const isMirrored = createMemo(() => {
    const track = previewStream()?.getVideoTracks()[0];
    return shouldMirrorVideoTrack(track);
  });

  return (
    <Section name="CallSettings.CameraSection">
      <CallDeviceRow
        settings={props.settings}
        kind="camera"
      />
      <Show
        when={!previewError()}
        fallback={
          <div
            class="speakers-and-camera-preview-error"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {i18n('CallSettings.CameraUnavailable')}
          </div>
        }
      >
        <div class="speakers-and-camera-preview">
          <video
            ref={(el) => { videoEl = el; }}
            class={classNames('speakers-and-camera-preview-video', isMirrored() && 'call-video-mirror')}
            autoplay
            playsinline
            muted
          />
        </div>
      </Show>
    </Section>
  );
}
