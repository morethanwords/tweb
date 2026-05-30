// Just the visual for a round video note while recording: a 360x360 circular
// camera preview centered on screen with a drop shadow (no dimming layer) and
// the same SVG progress ring incoming round videos use (the shared ProgressRing
// component, @components/progressRing).
//
// All recording *controls* (trash / waveform / timer / pause / preview / send)
// are the regular VoiceRecordingPanel + send button that live in the chat input
// — this owns none of them. ChatRecording drives the voice panel for video
// exactly as for audio; this overlay is purely the кружок.
//
// Authored in Solid: reactive signals (mode / playing / progress) back the JSX,
// and createVideoRecordingPanel() exposes the same imperative handle ChatRecording
// drives (mirrors createProgressRing in progressRing.tsx).

import {Accessor, createRoot, createSignal, JSX} from 'solid-js';
import classNames from '@helpers/string/classNames';
import ProgressRing from '@components/progressRing';

const STAGE_SIZE = 360;

export type VideoRecordingMode = 'recording' | 'paused';

export default function VideoRecordingPanel(props: {
  mode: Accessor<VideoRecordingMode | undefined>,
  playing: Accessor<boolean>,
  progress: Accessor<number>,
  // Refs fire synchronously while the body runs — that's how the handle below
  // gets the real DOM nodes (calling the component returns the HMR wrapper, not
  // the <div>). rootRef = the stage element to mount; ref = the preview <video>.
  rootRef: (stage: HTMLDivElement) => void,
  ref: (video: HTMLVideoElement) => void
}): JSX.Element {
  return (
    <div
      ref={props.rootRef}
      class={classNames(
        'video-recording-stage',
        props.mode() === 'recording' && 'video-recording-stage--recording',
        props.mode() === 'paused' && 'video-recording-stage--paused',
        props.playing() && 'video-recording-stage--playing'
      )}
    >
      <div
        class="video-recording-circle"
        style={{width: STAGE_SIZE + 'px', height: STAGE_SIZE + 'px'}}
      >
        <video
          class="video-recording-preview"
          ref={(el) => {
            el.muted = true;
            el.autoplay = true;
            el.playsInline = true;
            props.ref(el);
          }}
        />
        <ProgressRing
          size={STAGE_SIZE}
          strokeOpacity={0.9}
          class="video-recording-progress-ring"
          progress={props.progress()}
        />
      </div>
    </div>
  );
}

export interface VideoRecordingPanelHandle {
  element: HTMLDivElement;
  readonly previewVideo: HTMLVideoElement;
  setMode(mode: VideoRecordingMode): void;
  getMode(): VideoRecordingMode | undefined;
  startLivePreview(stream: MediaStream): void;
  reset(): void;
  setPlaying(isPlaying: boolean): void;
  getIsPlaying(): boolean;
  setProgress(progress: number): void;
  destroy(): void;
}

// Imperative handle for the (non-Solid) ChatRecording controller. Owns its own
// reactive root; destroy() disposes it.
export function createVideoRecordingPanel(): VideoRecordingPanelHandle {
  return createRoot((dispose) => {
    const [mode, setModeSignal] = createSignal<VideoRecordingMode | undefined>(undefined);
    const [playing, setPlayingSignal] = createSignal(false);
    const [progress, setProgressSignal] = createSignal(0);

    let element: HTMLDivElement;
    let previewVideo: HTMLVideoElement;
    // Bumped on each startLivePreview()/reset() so a pending "reveal on first
    // frame" callback from a superseded session is ignored.
    let liveToken = 0;
    let clearVideoTimer: number;

    // Capture the real DOM nodes via refs (set synchronously while the body
    // runs); the component's return value is the HMR wrapper, not the <div>.
    VideoRecordingPanel({
      mode,
      playing,
      progress,
      rootRef: (stage) => element = stage,
      ref: (video) => previewVideo = video
    });

    const setMode = (m: VideoRecordingMode) => {
      // A fresh recording/preview is about to show — cancel any pending
      // fade-out cleanup.
      if(clearVideoTimer) {
        clearTimeout(clearVideoTimer);
        clearVideoTimer = undefined;
      }
      setModeSignal(m);
      if(m === 'recording') setPlayingSignal(false);
    };

    const releasePreview = () => {
      previewVideo.srcObject = null;
      if(previewVideo.src) {
        previewVideo.removeAttribute('src');
        try {
          previewVideo.load();
        } catch(e) {}
      }
    };

    // Attach the live camera stream and reveal the circle only once the first
    // frame is actually painted — revealing immediately fades in a black circle
    // while the camera spins up. Cancelled if reset() runs first.
    const startLivePreview = (stream: MediaStream) => {
      const token = ++liveToken;
      previewVideo.srcObject = stream;
      previewVideo.muted = true;
      previewVideo.play().catch(() => {});

      let safety: number;
      const reveal = () => {
        if(safety) {
          clearTimeout(safety); // don't let the safety net fire after a real reveal
          safety = undefined;
        }
        if(liveToken !== token) return; // a newer call / reset superseded us
        setMode('recording');
      };

      const rvfc = previewVideo as HTMLVideoElement & {requestVideoFrameCallback?: (cb: () => void) => number};
      if(typeof rvfc.requestVideoFrameCallback === 'function') {
        rvfc.requestVideoFrameCallback(() => reveal());
      } else {
        previewVideo.addEventListener('loadeddata', reveal, {once: true});
      }
      // Safety net: reveal anyway if the frame callback never fires.
      safety = window.setTimeout(reveal, 800);
    };

    // Hide the circle and release the preview. We DON'T clear the camera source
    // immediately: dropping the mode class fades the stage out over its opacity
    // transition while the last camera frame stays painted, so the brief
    // camera-off black frame never shows. The source is released after the fade.
    const reset = () => {
      ++liveToken; // cancel any pending reveal-on-first-frame
      setModeSignal(undefined);
      setPlayingSignal(false);
      setProgressSignal(0);

      if(clearVideoTimer) clearTimeout(clearVideoTimer);
      clearVideoTimer = window.setTimeout(() => {
        clearVideoTimer = undefined;
        releasePreview();
      }, 250); // matches the .video-recording-stage opacity transition (.2s) + margin
    };

    return {
      element,
      get previewVideo() {
        return previewVideo;
      },
      setMode,
      getMode: () => mode(),
      startLivePreview,
      reset,
      setPlaying: (isPlaying: boolean) => setPlayingSignal(isPlaying),
      getIsPlaying: () => playing(),
      setProgress: (value: number) => setProgressSignal(value),
      destroy: () => {
        if(clearVideoTimer) clearTimeout(clearVideoTimer);
        releasePreview();
        element.remove();
        dispose();
      }
    };
  });
}
