import {createEffect, createMemo, createSignal, on, onCleanup, onMount, Show} from 'solid-js';
import Section from '@components/section';
import Row from '@components/rowTsx';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {useAppSettings} from '@stores/appSettings';
import showOutputDevicePopup from '@components/rtmp/outputDevicePopup';
import applyDeviceToActiveCall from '@lib/calls/applyDeviceToActiveCall';
import getStream from '@lib/calls/helpers/getStream';
import shouldMirrorVideoTrack from '@lib/calls/helpers/shouldMirrorVideoTrack';
import classNames from '@helpers/string/classNames';

// Self-contained "Camera" section used by both the in-call settings popup
// and the Speakers-and-Camera settings tab. Owns its own preview MediaStream
// — acquired on mount, released on unmount, re-acquired when the persisted
// cameraId changes — so neither callsite has to plumb cleanup itself.
//
// When `getUserMedia({video})` fails (no permission, no device), the preview
// block is suppressed via `previewError`. The picker row stays visible so
// the user can still pick a different device.
export default function CallCameraSection() {
  const [appSettings, setAppSettings] = useAppSettings();

  const [devices, setDevices] = createSignal<MediaDeviceInfo[]>([]);
  const [previewStream, setPreviewStream] = createSignal<MediaStream | undefined>(undefined);
  const [previewError, setPreviewError] = createSignal<string | undefined>(undefined);

  let videoEl: HTMLVideoElement | undefined;

  const refreshDevices = () => {
    navigator.mediaDevices.enumerateDevices().then(setDevices).catch(() => setDevices([]));
  };

  const stopPreview = () => {
    const stream = previewStream();
    if(stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    setPreviewStream(undefined);
  };

  // (Re)acquire the camera preview using the persisted choice. We avoid
  // explicit constraints on the "Default" path so the browser picks the
  // OS-preferred camera with the user's existing permission, instead of
  // failing with NotFoundError on a freshly removed device. Stale-id
  // recovery lives inside `getStream`.
  const startPreview = async() => {
    stopPreview();
    try {
      const id = appSettings.callDevices?.cameraId;
      const stream = await getStream({
        video: id ? {deviceId: {exact: id}} : true
      });
      setPreviewStream(stream);
      setPreviewError(undefined);
    } catch(err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPreviewError(msg);
    }
  };

  onMount(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener?.('devicechange', refreshDevices);
    startPreview();
    onCleanup(() => {
      navigator.mediaDevices.removeEventListener?.('devicechange', refreshDevices);
      stopPreview();
    });
  });

  // Re-spin the preview whenever the persisted cameraId changes — keeps the
  // <video> in sync with the picker without manual wiring.
  createEffect(on(() => appSettings.callDevices?.cameraId, () => {
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

  const labelFor = (id: string) => {
    if(!id) return i18n('CallSettings.DeviceDefault');
    const found = devices().find((d) => d.kind === 'videoinput' && d.deviceId === id);
    return found ? wrapEmojiText(found.label || found.deviceId) : i18n('CallSettings.DeviceDefault');
  };

  const onPickCamera = () => {
    showOutputDevicePopup({
      kind: 'videoinput',
      currentId: appSettings.callDevices?.cameraId || '',
      titleLangKey: 'CallSettings.Camera',
      onPick: (id) => {
        setAppSettings('callDevices', 'cameraId', id);
        // Hot-swap the live call's camera too — `setAppSettings` only
        // persists the choice; without this, an active call keeps sending
        // the old camera feed until the user drops and rejoins.
        applyDeviceToActiveCall('camera', id);
      },
      onStaleCurrentId: () => {
        setAppSettings('callDevices', 'cameraId', '');
      }
    });
  };

  return (
    <Section name="CallSettings.CameraSection">
      <Row clickable={onPickCamera}>
        <Row.Title
          titleRight={labelFor(appSettings.callDevices?.cameraId || '')}
          titleRightSecondary
        >
          {i18n('CallSettings.Camera')}
        </Row.Title>
      </Row>
      <Show when={!previewError()}>
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
