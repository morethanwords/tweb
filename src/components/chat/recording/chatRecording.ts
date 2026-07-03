// ChatRecording — the voice + round-video-note recording collaborator extracted
// out of ChatInput. Owns all recording state (recorders, waveform analysers, the
// voice + video panels, playback) and every method that drives a recording
// session. ChatInput keeps the send button / input row and delegates the
// recording branches here.
//
// `import type ChatInput` is intentionally TYPE-ONLY to avoid a runtime import
// cycle (ChatInput constructs this class at runtime).

import type ChatInput from '../input';
import {POSTING_NOT_ALLOWED_MAP} from '../input';
import {ChatType} from '../chatType';
import opusDecodeController from '@lib/opusDecodeController';
import VoiceWaveformAnalyser from '@helpers/voiceWaveformAnalyser';
import LiveWaveformAnalyser from '@helpers/voiceRecorder/liveWaveformAnalyser';
import NativeVoiceRecorder, {isNativeVoiceRecorderSupported} from '@helpers/voiceRecorder/nativeVoiceRecorder';
import NativeVideoRecorder, {isNativeVideoRecorderSupported} from '@helpers/videoRecorder/nativeVideoRecorder';
import VoiceRecordingPanel from '@components/chat/voiceRecording/voiceRecordingPanel';
import {createVideoRecordingPanel, VideoRecordingPanelHandle} from '@components/chat/recording/videoRecordingPanel';
import {appSettings} from '@stores/appSettings';
import {toast, toastNew} from '@components/toast';
import {Listener} from '@helpers/listenerSetter';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import findUpClassName from '@helpers/dom/findUpClassName';
import blurActiveElement from '@helpers/dom/blurActiveElement';
import {attachClickEvent, simulateClickEvent} from '@helpers/dom/clickEvent';
import {fastRaf} from '@helpers/schedulers';
import PopupPeer from '@components/popups/peer';
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import toHHMMSS from '@helpers/string/toHHMMSS';
import PopupElement from '@components/popups';
import contextMenuController from '@helpers/contextMenuController';
import {ChatRights} from '@appManagers/appChatsManager';
import createContextMenu from '@helpers/dom/createContextMenu';
import {PAYMENT_REJECTED} from '@components/chat/paidMessagesInterceptor';
import {createPosterFromMedia} from '@helpers/createPoster';
import type {MediaSize} from '@helpers/mediaSize';
import cancelEvent from '@helpers/dom/cancelEvent';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';

const RECORD_MIN_TIME = 500;
// Max duration of a round video note. Matches the cap official clients enforce
// (`60s`); the recorder stops automatically when the progress ring fills.
const VIDEO_RECORD_MAX_MS = 60_000;

// Mirrors the module-local CLASS_NAME in input.ts (`'chat-input'`). The
// outside-click guards installed while recording test the click target against
// this class to decide whether a click is "inside" the chat input.
const CLASS_NAME = 'chat-input';

export default class ChatRecording {
  private recorder: any;
  private videoRecorder: NativeVideoRecorder;
  private waveformAnalyser: VoiceWaveformAnalyser;
  private liveWaveformAnalyser: LiveWaveformAnalyser;
  public active = false;
  // Which recorder is currently active during a recording session. When not
  // recording, the user's persisted `recordingMediaType` setting dictates the
  // icon shown on the send button; once a recording starts we capture the
  // type here so toggle-mid-recording can't desync the UI.
  private recordingType: 'voice' | 'video' = 'voice';
  private recordPaused = false;
  private recordCanceled = false;
  private recordStartTime = 0;
  private recordAccumulatedMs = 0;
  private recordingOverlayListener: Listener;
  private recordingNavigationItem: NavigationItem;
  private voiceRecordingPanel: VoiceRecordingPanel;
  private videoRecordingPanel: VideoRecordingPanelHandle;
  private playbackAudio: HTMLAudioElement;
  private playbackObjectUrl: string;
  private playbackRafId: number;
  private voiceMenuClickGuard: (e: MouseEvent) => void;
  // Recorded blob URL used for paused-preview playback inside the round video
  // panel. Revoked on stop() / send / cancel to release the captured frames.
  private videoPlaybackObjectUrl: string;
  // Audio tap for the live waveform during video recording. The MediaRecorder
  // doesn't expose PCM, so we open a parallel AudioContext on a CLONE of the
  // stream's audio track (tapping the original track that MediaRecorder is
  // recording starves both consumers → silent recording + flat waveform).
  private videoAudioContext: AudioContext;
  private videoWaveformStream: MediaStream;
  private videoPlaybackRafId: number;
  // Set when a video recording hits VIDEO_RECORD_MAX_MS: recording stops at the
  // cap and switches to the paused-preview state (iOS-style) — the user can
  // preview + send/discard but cannot record further (resume is blocked).
  private videoLimitReached = false;
  // True from the moment a recording is requested until start() resolves —
  // blocks a duplicate start during the camera warm-up wait.
  private isStartingRecording = false;
  // Set when a left-button long-press on the record button opens the mode-switch
  // menu, so the click that ends the press doesn't also start a recording.
  private recordModeLongPressed = false;

  private releaseMediaPlayback: () => void;

  constructor(private input: ChatInput) {
    this.constructRecorder();

    this.voiceRecordingPanel = new VoiceRecordingPanel({
      onCancel: () => this.onCancelRecordClick(),
      onPauseToggle: () => this.onPauseToggleClick(),
      onPlayToggle: () => this.onPlayToggleClick(),
      onSeek: (progress) => this.onPlaybackSeek(progress)
    });
    // The panel is an absolutely-positioned overlay inside the input row.
    // It sits *under* btnSendContainer in DOM order so the send button stays
    // on top while everything else (attach, input, emoji) is hidden via CSS.
    this.input.newMessageWrapper.insertBefore(this.voiceRecordingPanel.element, this.input.btnSendContainer);

    // Round-video-note panel — created here (and not next to the voice panel)
    // because constructRecorder is what sets this.videoRecorder. The control
    // bar slots into the input row the same way as voice; the dim overlay +
    // 360x360 round preview is mounted into the chat container so it covers
    // bubbles but stays under the input bar (which has a higher z-index).
    if(this.videoRecorder) {
      // Just the centered round preview — all recording controls stay in the
      // chat input (the same voiceRecordingPanel + btn-send the voice flow
      // uses). Mounted on <body> so it's reliably screen-centered.
      this.videoRecordingPanel = createVideoRecordingPanel();
      document.body.append(this.videoRecordingPanel.element);
    }

    this.setupRecordingModeMenu();
  }

  private constructRecorder() {
    const config = {
      // encoderBitRate: 32,
      // encoderPath: "../dist/encoderWorker.min.js",
      encoderSampleRate: 48000,
      monitorGain: 0,
      numberOfChannels: 1,
      recordingGain: 1,
      reuseWorker: true
    };

    if(isNativeVoiceRecorderSupported()) {
      try {
        this.recorder = new NativeVoiceRecorder(config);
      } catch(err) {
        console.error('NativeVoiceRecorder constructor error:', err);
      }
    }

    if(!this.recorder) {
      const Recorder = (window as any).Recorder;
      if(Recorder) try {
        this.recorder = new Recorder(config);
      } catch(err) {
        console.error('Recorder constructor error:', err);
      }
    }

    if(isNativeVideoRecorderSupported()) {
      try {
        this.videoRecorder = new NativeVideoRecorder({
          width: 400,
          height: 400,
          frameRate: 30,
          videoBitsPerSecond: 1_200_000,
          audioBitsPerSecond: 64_000
        });
      } catch(err) {
        console.error('NativeVideoRecorder constructor error:', err);
      }
    }

    if(!this.recorder) {
      return;
    }

    attachClickEvent(this.input.btnCancelRecord, this.onCancelRecordClick, {listenerSetter: this.input.listenerSetter});

    this.recorder.onstop = () => {
      this.setRecording(false);
      this.input.chatInput.classList.remove('is-locked');

      if(this.waveformAnalyser) {
        this.waveformAnalyser.finish();
        this.waveformAnalyser = undefined;
      }
      if(this.recorder instanceof NativeVoiceRecorder) {
        this.recorder.notifySamples = undefined;
      }
      this.teardownLiveWaveform();
      this.stopPlayback();
      // Any menu-open click guard from the SendMenu is now meaningless —
      // recording is over.
      this.setVoiceRecordingMenuGuard(false);
    };

    this.recorder.ondataavailable = async(typedArray: Uint8Array) => {
      if(this.releaseMediaPlayback) {
        this.releaseMediaPlayback();
        this.releaseMediaPlayback = undefined;
      }

      if(this.recordingOverlayListener) {
        this.input.listenerSetter.remove(this.recordingOverlayListener);
        this.recordingOverlayListener = undefined;
      }

      if(this.recordingNavigationItem) {
        appNavigationController.removeItem(this.recordingNavigationItem);
        this.recordingNavigationItem = undefined;
      }

      const waveform = this.waveformAnalyser?.finish();
      this.waveformAnalyser = undefined;

      if(this.recordCanceled) {
        return;
      }

      const sendingParams = this.input.chat.getMessageSendingParams();

      const preparedPaymentResult = await this.input.paidMessageInterceptor.prepareStarsForPayment(1);
      if(preparedPaymentResult === PAYMENT_REJECTED) return;

      sendingParams.confirmedPaymentResult = preparedPaymentResult;

      const duration = this.getRecordingElapsedMs() / 1000 | 0;
      const dataBlob = new Blob([typedArray as BlobPart], {type: 'audio/ogg'});
      opusDecodeController.decode(typedArray, false).then((result) => {
        opusDecodeController.setKeepAlive(false);

        // тут objectURL ставится уже с audio/wav
        this.input.managers.appMessagesManager.sendFile({
          ...sendingParams,
          file: dataBlob,
          isVoiceMessage: true,
          isMedia: true,
          duration,
          waveform,
          objectURL: result.url,
          clearDraft: true
        });

        this.input.onMessageSent(false, true);
      });
    };

    if(this.videoRecorder) {
      this.videoRecorder.onstop = () => {
        this.setRecording(false);
        this.videoLimitReached = false;
        this.input.chatInput.classList.remove('is-locked');
        this.stopVideoPlayback();
        this.teardownVideoWaveform();
        // Reset the voice panel (in place) + fade out the round preview. The
        // camera is kept alive through the fade (see NativeVideoRecorder), so
        // the last frame fades instead of cutting to black — release it after.
        this.voiceRecordingPanel?.setMode('recording');
        this.voiceRecordingPanel?.clearPeaks();
        this.videoRecordingPanel?.reset();
        setTimeout(() => this.videoRecorder?.releaseStream(), 300);
        this.setVoiceRecordingMenuGuard(false);
      };

      this.videoRecorder.ondataavailable = async(blob: Blob) => {
        if(this.releaseMediaPlayback) {
          this.releaseMediaPlayback();
          this.releaseMediaPlayback = undefined;
        }

        if(this.recordingOverlayListener) {
          this.input.listenerSetter.remove(this.recordingOverlayListener);
          this.recordingOverlayListener = undefined;
        }

        if(this.recordingNavigationItem) {
          appNavigationController.removeItem(this.recordingNavigationItem);
          this.recordingNavigationItem = undefined;
        }

        if(this.recordCanceled) {
          return;
        }

        // Grab a poster from the still-live camera frame *before* anything
        // awaits — gives the optimistic (uploading) bubble something to show
        // instead of a black circle while the upload runs.
        const thumbPromise = this.captureVideoPoster();

        const sendingParams = this.input.chat.getMessageSendingParams();
        const preparedPaymentResult = await this.input.paidMessageInterceptor.prepareStarsForPayment(1);
        if(preparedPaymentResult === PAYMENT_REJECTED) return;
        sendingParams.confirmedPaymentResult = preparedPaymentResult;

        const duration = this.getRecordingElapsedMs() / 1000 | 0;
        const thumb = await thumbPromise;
        // The Blob already carries the recorder's mime type. We hand it to
        // sendFile with isRoundMessage=true so the documentAttributeVideo flag
        // gets `round_message=true` (see appMessagesManager.sendFile).
        const objectURL = URL.createObjectURL(blob);
        this.input.managers.appMessagesManager.sendFile({
          ...sendingParams,
          file: blob,
          isRoundMessage: true,
          isMedia: true,
          duration,
          // The capture is square at the configured size; appMessagesManager
          // reads w/h off the file when omitted here, but providing them makes
          // the optimistic message render correctly.
          width: 400,
          height: 400,
          objectURL,
          thumb,
          clearDraft: true
        });

        this.input.onMessageSent(false, true);
      };
    }
  }

  private onCancelRecordClick = (e?: Event) => {
    if(e) {
      cancelEvent(e);
    }

    this.recordCanceled = true;
    this.stopPlayback();
    this.stopVideoPlayback();
    this.getActiveRecorder()?.stop();
    if(this.recordingType === 'voice') {
      opusDecodeController.setKeepAlive(false);
    }
  };

  private getRecordingElapsedMs() {
    if(this.recordPaused) return this.recordAccumulatedMs;
    return this.recordAccumulatedMs + (Date.now() - this.recordStartTime);
  }

  private teardownLiveWaveform() {
    if(this.liveWaveformAnalyser) {
      this.liveWaveformAnalyser.destroy();
      this.liveWaveformAnalyser = undefined;
    }
  }

  private onPauseToggleClick = () => {
    if(!this.active) return;
    if(this.recordingType === 'video') {
      this.onVideoPauseToggleClick();
      return;
    }
    if(!this.recorder) return;

    if(this.recordPaused) {
      // Resume recording from paused state. Keep the existing waveform —
      // new live bars will push in from the right, gradually shifting the
      // snapshot off to the left rather than starting from scratch.
      this.stopPlayback();
      if(typeof this.recorder.resume === 'function') {
        this.recorder.resume();
      }
      this.recordPaused = false;
      this.recordStartTime = Date.now();
      this.voiceRecordingPanel?.setMode('recording');
      this.voiceRecordingPanel?.setSeekable(false);
      this.liveWaveformAnalyser?.setPaused(false);
      this.waveformAnalyser?.setPaused(false);
      this.startRecordingTimerLoop();
    } else {
      // Pause active recording. Replace the rolling live waveform with the
      // full compressed peaks the analyser has accumulated so playback
      // progress maps to the whole recording duration, not just the bars
      // that happened to fit in the live window.
      if(typeof this.recorder.pause !== 'function') return;
      this.recordAccumulatedMs += Date.now() - this.recordStartTime;
      this.recordPaused = true;
      this.liveWaveformAnalyser?.setPaused(true);
      this.waveformAnalyser?.setPaused(true);
      const fullPeaks = this.waveformAnalyser?.getCurrentPeaks();
      if(fullPeaks && fullPeaks.length) {
        this.voiceRecordingPanel?.setPeaks(fullPeaks);
      }
      this.voiceRecordingPanel?.setMode('paused');
      this.voiceRecordingPanel?.setPlaybackProgress(undefined);
      this.voiceRecordingPanel?.setSeekable(true);
      Promise.resolve(this.recorder.pause()).catch(() => {});
    }
  };

  private onVideoPauseToggleClick() {
    if(!this.videoRecorder) return;

    if(this.recordPaused) {
      // Max length hit — recording is locked at the cap. Keep the resume button
      // but tell the user why pressing it does nothing.
      if(this.videoLimitReached) {
        toastNew({langPackKey: 'Chat.Input.Record.VideoLimitReached'});
        return;
      }
      // Resume from paused state — discard any preview playback, restore the
      // live camera feed in the preview <video>, and continue recording.
      this.stopVideoPlayback();
      this.videoRecorder.resume();
      this.recordPaused = false;
      this.recordStartTime = Date.now();
      this.voiceRecordingPanel?.setMode('recording');
      this.voiceRecordingPanel?.setSeekable(false);
      this.liveWaveformAnalyser?.setPaused(false);
      this.waveformAnalyser?.setPaused(false);
      // Restore the live camera feed (reveals on its first frame).
      this.videoRecordingPanel?.startLivePreview(this.videoRecorder.stream);
      this.startVideoRecordingTimerLoop();
    } else {
      this.recordAccumulatedMs += Date.now() - this.recordStartTime;
      this.recordPaused = true;
      this.liveWaveformAnalyser?.setPaused(true);
      this.waveformAnalyser?.setPaused(true);
      // Freeze the waveform on the full-recording peaks, like voice.
      const fullPeaks = this.waveformAnalyser?.getCurrentPeaks();
      if(fullPeaks && fullPeaks.length) this.voiceRecordingPanel?.setPeaks(fullPeaks);
      this.voiceRecordingPanel?.setMode('paused');
      this.voiceRecordingPanel?.setPlaybackProgress(undefined);
      this.voiceRecordingPanel?.setSeekable(true);
      this.videoRecordingPanel?.setMode('paused');
      Promise.resolve(this.videoRecorder.pause()).catch(() => {});
    }
  }

  private onPlayToggleClick = () => {
    if(!this.active || !this.recordPaused) return;
    if(this.recordingType === 'video') {
      this.onVideoPlayToggleClick();
      return;
    }
    if(this.playbackAudio && !this.playbackAudio.paused) {
      this.playbackAudio.pause();
      return;
    }
    if(this.playbackAudio && this.playbackAudio.currentTime > 0 && this.playbackAudio.currentTime < this.playbackAudio.duration) {
      this.playbackAudio.play().catch(() => {});
      return;
    }
    this.startPlaybackFromSnapshot();
  };

  private onVideoPlayToggleClick() {
    if(!this.videoRecordingPanel || !this.videoRecorder) return;
    const video = this.videoRecordingPanel.previewVideo;
    // If we already have a playable snapshot mounted in the <video>, just
    // play/pause it directly. The first call swaps in the snapshot blob.
    if(!video.srcObject && video.src) {
      if(video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
      return;
    }
    this.startVideoPlaybackFromSnapshot();
  }

  // The mid-recording snapshot is a non-finalized webm/mp4, so video.duration
  // is usually Infinity/NaN — fall back to the elapsed recording time we
  // already track for progress + seeking math.
  private getVideoPreviewDurationSec() {
    const video = this.videoRecordingPanel?.previewVideo;
    if(video && video.duration && isFinite(video.duration)) return video.duration;
    return this.recordAccumulatedMs / 1000;
  }

  private startVideoPlaybackFromSnapshot() {
    const snapshot = this.videoRecorder?.getSnapshot();
    if(!snapshot || !snapshot.size || !this.videoRecordingPanel) return;
    this.stopVideoPlayback();
    this.videoPlaybackObjectUrl = URL.createObjectURL(snapshot);
    const video = this.videoRecordingPanel.previewVideo;
    video.srcObject = null;
    // Unmute for preview (it was muted while mirroring the live camera to
    // avoid feedback). volume + removeAttribute guard against a sticky
    // muted-autoplay state.
    video.muted = false;
    video.volume = 1;
    video.removeAttribute('muted');
    video.loop = false;
    video.src = this.videoPlaybackObjectUrl;
    // videoRecordingPanel.setPlaying toggles the preview un-mirror; the
    // voiceRecordingPanel owns the play/pause icon + waveform playhead + timer.
    const setPlaying = (p: boolean) => {
      this.videoRecordingPanel?.setPlaying(p);
      this.voiceRecordingPanel?.setPlaying(p);
    };
    // Per-frame tick — `timeupdate` only fires every ~250ms, which looks jerky;
    // a rAF loop reading currentTime each frame keeps the timer/ring/playhead
    // smooth.
    const tick = () => {
      if(this.videoPlaybackRafId === undefined) return;
      const dur = this.getVideoPreviewDurationSec();
      if(dur) {
        const progress = Math.max(0, Math.min(1, video.currentTime / dur));
        this.voiceRecordingPanel?.setPlaybackProgress(progress);
        this.videoRecordingPanel?.setProgress(progress);
        this.voiceRecordingPanel?.setTimer(this.formatRecordingTimer(video.currentTime * 1000));
      }
      this.videoPlaybackRafId = requestAnimationFrame(tick);
    };
    const startTick = () => {
      if(this.videoPlaybackRafId === undefined) this.videoPlaybackRafId = requestAnimationFrame(tick);
    };
    const stopTick = () => {
      if(this.videoPlaybackRafId !== undefined) {
        cancelAnimationFrame(this.videoPlaybackRafId);
        this.videoPlaybackRafId = undefined;
      }
    };
    video.onplay = () => {
      setPlaying(true);
      startTick();
    };
    video.onpause = () => {
      setPlaying(false);
      stopTick();
    };
    video.onended = () => {
      setPlaying(false);
      stopTick();
      this.voiceRecordingPanel?.setPlaybackProgress(undefined);
      this.voiceRecordingPanel?.setTimer(this.formatRecordingTimer(this.recordAccumulatedMs));
      // Restore the ring to the recorded fraction (its frozen-pause look).
      this.videoRecordingPanel?.setProgress(this.recordAccumulatedMs / VIDEO_RECORD_MAX_MS);
    };
    video.play().catch(() => {
      // Preview playback can reject on routine autoplay hiccups — just reset,
      // no need to log (mirrors the voice flow's silent playback catch).
      this.stopVideoPlayback();
    });
  }

  private stopVideoPlayback() {
    if(this.videoPlaybackRafId !== undefined) {
      cancelAnimationFrame(this.videoPlaybackRafId);
      this.videoPlaybackRafId = undefined;
    }
    if(!this.videoRecordingPanel) return;
    const video = this.videoRecordingPanel.previewVideo;
    try {
      video.pause();
    } catch(e) {}
    video.onplay = null;
    video.onpause = null;
    video.onended = null;
    video.muted = true;
    if(this.videoPlaybackObjectUrl) {
      try {
        URL.revokeObjectURL(this.videoPlaybackObjectUrl);
      } catch(e) {}
      this.videoPlaybackObjectUrl = undefined;
    }
    if(video.src) {
      video.removeAttribute('src');
      try {
        video.load();
      } catch(e) {}
    }
    this.videoRecordingPanel.setPlaying(false);
    this.voiceRecordingPanel?.setPlaying(false);
  }

  // Drives the timer text + progress-ring fill while a video recording is
  // active. Pauses (returns without re-scheduling) when recording is paused,
  // resumed by onVideoPauseToggleClick. At VIDEO_RECORD_MAX_MS the recording
  // doesn't auto-send — it stops at the cap and drops into the paused-preview
  // state (iOS-style): preview + send/discard, but no further recording.
  private startVideoRecordingTimerLoop() {
    const r = () => {
      if(!this.active || this.recordPaused) return;
      if(this.recordingType !== 'video') return;
      const elapsed = this.getRecordingElapsedMs();
      if(elapsed >= VIDEO_RECORD_MAX_MS) {
        this.reachVideoLimit();
        return;
      }
      // Timer text lives in the shared voice panel; the ring is the video
      // overlay's own progress affordance.
      if(!this.voiceRecordingPanel?.getIsPlaying()) {
        this.voiceRecordingPanel?.setTimer(this.formatRecordingTimer(elapsed));
      }
      this.videoRecordingPanel?.setProgress(elapsed / VIDEO_RECORD_MAX_MS);
      fastRaf(r);
    };
    r();
  }

  // Hit the max duration: lock the recording at the cap and switch to the
  // paused-preview state. Resume is then blocked (see onVideoPauseToggleClick);
  // the user can only preview, send or discard.
  private reachVideoLimit() {
    if(this.videoLimitReached) return;
    this.videoLimitReached = true;
    this.videoRecordingPanel?.setProgress(1);
    // Enter the paused state (recordPaused is false here, so this pauses).
    this.onVideoPauseToggleClick();
    this.voiceRecordingPanel?.setTimer(this.formatRecordingTimer(VIDEO_RECORD_MAX_MS));
  }

  // Install / remove the document-level click guard that closes the SendMenu
  // on the first click anywhere outside the menu while a voice recording is
  // active. Without this guard, a left-click would close the menu and also
  // hit the underlying button (cancel/pause/send) on the way through — every
  // visible button while recording is its own action target. Capture phase so
  // we beat the buttons' own bubble-phase click listeners.
  public setVoiceRecordingMenuGuard(active: boolean) {
    if(this.voiceMenuClickGuard) {
      document.removeEventListener('click', this.voiceMenuClickGuard, {capture: true});
      this.voiceMenuClickGuard = undefined;
    }
    if(!active || !this.active) return;

    this.voiceMenuClickGuard = (e: MouseEvent) => {
      // Let clicks inside the menu through so menu items still work.
      if(findUpClassName(e.target as HTMLElement, 'btn-menu')) return;
      cancelEvent(e);
      if(contextMenuController.isOpened()) contextMenuController.close();
    };
    document.addEventListener('click', this.voiceMenuClickGuard, {capture: true});
  }

  // Stop the recorder so its ondataavailable handler sends the voice file.
  // Used by the send context menu (Silent / Schedule / SendWhenOnline) while
  // recording — the menu just sets the relevant flag on the ChatInput and
  // delegates to this helper to commit the recording. The actual silent /
  // scheduleDate flags are read back from this.input by getMessageSendingParams.
  // Stop + send the in-progress recording from the send button's context menu
  // (Send Without Sound / Schedule / Send When Online). Must stop the ACTIVE
  // recorder — voice OR video — not always the voice one, or sending a round
  // video note from the menu does nothing. The silent/schedule flags are already
  // set by the caller and picked up via getMessageSendingParams on send.
  public finishRecordingFromMenu() {
    if(!this.active) return;
    this.stopPlayback();
    this.stopVideoPlayback();
    this.getActiveRecorder()?.stop();
  }

  // Click-to-seek from the waveform. progress is 0..1 along the bars.
  // If audio hasn't been decoded yet we kick playback off at that offset.
  private onPlaybackSeek(progress: number) {
    if(!this.recordPaused) return;
    // The shared voice panel's waveform seek is wired to this; for a video
    // recording it should scrub the round-video preview instead of audio.
    if(this.recordingType === 'video') {
      this.onVideoPlaybackSeek(progress);
      return;
    }
    if(this.playbackAudio && this.playbackAudio.duration && !isNaN(this.playbackAudio.duration)) {
      const target = Math.max(0, Math.min(this.playbackAudio.duration, progress * this.playbackAudio.duration));
      this.playbackAudio.currentTime = target;
      this.voiceRecordingPanel?.setPlaybackProgress(progress);
      if(this.playbackAudio.paused) this.playbackAudio.play().catch(() => {});
      return;
    }
    // No audio yet — start playback and seek once metadata is available.
    this.startPlaybackFromSnapshot(progress);
  }

  private async startPlaybackFromSnapshot(seekProgress?: number) {
    if(!this.recorder || typeof this.recorder.getSnapshot !== 'function') return;
    const snapshot: Uint8Array = this.recorder.getSnapshot();
    if(!snapshot || !snapshot.length) return;

    // Tear down any prior playback before decoding the fresh snapshot.
    this.stopPlayback();

    try {
      const {url} = await opusDecodeController.decode(snapshot, false);
      this.playbackObjectUrl = url;
    } catch(err) {
      console.error('[ChatInput] voice playback decode error:', err);
      return;
    }
    if(!this.recordPaused) {
      // Recording was resumed while we were decoding — drop the result.
      this.playbackObjectUrl && URL.revokeObjectURL(this.playbackObjectUrl);
      this.playbackObjectUrl = undefined;
      return;
    }

    const audio = this.playbackAudio = new Audio(this.playbackObjectUrl);
    audio.preload = 'auto';

    const onTick = () => {
      if(this.playbackAudio !== audio) return;
      if(!audio.duration || isNaN(audio.duration)) {
        this.playbackRafId = requestAnimationFrame(onTick);
        return;
      }
      const progress = audio.currentTime / audio.duration;
      this.voiceRecordingPanel?.setPlaybackProgress(progress);

      const playedMs = audio.currentTime * 1000;
      const playedSec = playedMs / 1000;
      const ms = playedMs % 1000;
      this.voiceRecordingPanel?.setTimer(toHHMMSS(playedSec) + ',' + ('00' + Math.round(ms / 10)).slice(-2));

      this.playbackRafId = requestAnimationFrame(onTick);
    };

    audio.addEventListener('play', () => {
      this.voiceRecordingPanel?.setPlaying(true);
      cancelAnimationFrame(this.playbackRafId);
      this.playbackRafId = requestAnimationFrame(onTick);
    });
    audio.addEventListener('pause', () => {
      this.voiceRecordingPanel?.setPlaying(false);
      cancelAnimationFrame(this.playbackRafId);
    });
    audio.addEventListener('ended', () => {
      this.voiceRecordingPanel?.setPlaying(false);
      // Clear the progress overlay so all bars return to the active primary
      // colour after playback — same look as the just-paused state.
      this.voiceRecordingPanel?.setPlaybackProgress(undefined);
      this.voiceRecordingPanel?.setTimer(this.formatRecordingTimer(this.recordAccumulatedMs));
      cancelAnimationFrame(this.playbackRafId);
    });

    if(seekProgress != null) {
      const seek = () => {
        if(audio.duration && !isNaN(audio.duration)) {
          audio.currentTime = Math.max(0, Math.min(audio.duration, seekProgress * audio.duration));
          this.voiceRecordingPanel?.setPlaybackProgress(seekProgress);
          audio.removeEventListener('loadedmetadata', seek);
        }
      };
      audio.addEventListener('loadedmetadata', seek);
      seek();
    }

    audio.play().catch((err) => {
      console.error('[ChatInput] voice playback play() error:', err);
      this.stopPlayback();
    });
  }

  private formatRecordingTimer(totalMs: number) {
    const seconds = totalMs / 1000;
    const ms = totalMs % 1000;
    return toHHMMSS(seconds) + ',' + ('00' + Math.round(ms / 10)).slice(-2);
  }

  // The loop pauses (returns without re-scheduling) when recording is paused
  // so we don't burn ~60 rAFs per second writing the same string to the DOM —
  // resume() restarts it from onPauseToggleClick.
  private startRecordingTimerLoop() {
    const r = () => {
      if(!this.active || this.recordPaused) return;
      const elapsed = this.getRecordingElapsedMs();
      const formatted = this.formatRecordingTimer(elapsed);
      if(!this.voiceRecordingPanel?.getIsPlaying()) {
        this.voiceRecordingPanel?.setTimer(formatted);
      }
      fastRaf(r);
    };
    r();
  }

  private stopPlayback() {
    if(this.playbackRafId) {
      cancelAnimationFrame(this.playbackRafId);
      this.playbackRafId = undefined;
    }
    if(this.playbackAudio) {
      try {
        this.playbackAudio.pause();
      } catch(e) {}
      this.playbackAudio.src = '';
      this.playbackAudio = undefined;
    }
    if(this.playbackObjectUrl) {
      try {
        URL.revokeObjectURL(this.playbackObjectUrl);
      } catch(e) {}
      this.playbackObjectUrl = undefined;
    }
    this.voiceRecordingPanel?.setPlaying(false);
    this.voiceRecordingPanel?.setPlaybackProgress(undefined);
  }

  private setRecording(value: boolean) {
    if(this.active === value) {
      return;
    }

    this.active = value;
    this.input.starsState.set({isRecording: value});
    this.input.setShrinking(this.active, ['is-recording']);
    this.input.updateSendBtn();
    this.input.onRecording?.(value);
  }

  // Swallow the click that ends a record-button long-press (it already opened
  // the mode-switch menu). Returns true when the click should be ignored.
  public consumeLongPressSuppression(): boolean {
    if(this.recordModeLongPressed) {
      this.recordModeLongPressed = false;
      return true;
    }
    return false;
  }

  public hasAnyRecorder(): boolean {
    return !!(this.recorder || this.videoRecorder);
  }

  // Whether the voice recorder specifically is available. Drives the send
  // button's record/send icon choice (no voice recorder ⇒ never a record icon).
  public hasVoiceRecorder(): boolean {
    return !!this.recorder;
  }

  // Handle the send button's recording branch: stop+send (or cancel if too
  // short). Called by ChatInput.onBtnSendClick when a recording is active.
  public handleSendButtonClick() {
    if(this.getRecordingElapsedMs() < RECORD_MIN_TIME) {
      this.onCancelRecordClick();
    } else {
      this.stopPlayback();
      this.getActiveRecorder()?.stop();
    }
  }

  // Empty input + not recording: start a recording in the active media type.
  public startActive() {
    this.startRecordingNow(this.getActiveRecordingMediaType());
  }

  // Whether voice ↔ video can be switched right now: only in the idle
  // record-button state (empty field, not recording / editing / forwarding) and
  // when both recorders exist. Shared by the record-button context menu, the
  // desktop long-press, and the attach-menu items.
  public canSwitchRecordingMode(): boolean {
    return this.input.isInputEmpty() &&
      !this.active &&
      !this.input.forwarding &&
      !this.input.editMsgId &&
      !this.input.suggestedPost?.hasMedia &&
      this.input.chat.type !== ChatType.Stories &&
      !!this.recorder &&
      !!this.videoRecorder;
  }

  public setRecordingMediaType(type: 'voice' | 'video') {
    this.input.chat.setAppSettings('recordingMediaType', type);
    this.input.updateSendBtn();
  }

  private setupRecordingModeMenu() {
    if(!this.recorder || !this.videoRecorder) return; // nothing to switch between

    const contextMenu = createContextMenu({
      buttons: [{
        icon: 'microphone',
        text: 'Chat.Input.Record.Voice',
        onClick: () => this.setRecordingMediaType('voice'),
        verify: () => this.canSwitchRecordingMode() && this.getActiveRecordingMediaType() !== 'voice'
      }, {
        icon: 'recordround',
        text: 'Chat.Input.Record.Video',
        onClick: () => this.setRecordingMediaType('video'),
        verify: () => this.canSwitchRecordingMode() && this.getActiveRecordingMediaType() !== 'video'
      }],
      listenTo: this.input.btnSend,
      listenerSetter: this.input.listenerSetter
    });

    // Desktop: hold the left mouse button on the record button (~400ms) to open
    // the same switch menu — more discoverable than the right-click. Touch
    // devices already get this via attachContextMenuListener (long-press →
    // contextmenu) inside createContextMenu, so this is mouse-only.
    if(!IS_TOUCH_SUPPORTED) {
      let pressTimer: number;
      const clearPressTimer = () => {
        if(pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = 0;
        }
      };

      this.input.listenerSetter.add(this.input.btnSend)('mousedown', (e: MouseEvent) => {
        this.recordModeLongPressed = false; // clear any stale flag from an aborted press
        if(e.button !== 0 || !this.canSwitchRecordingMode()) return; // left button, idle record state
        clearPressTimer();
        pressTimer = window.setTimeout(() => {
          pressTimer = 0;
          this.recordModeLongPressed = true; // suppress the release click (see onBtnSendClick)
          contextMenu.open(e);
        }, 400);
      });
      this.input.listenerSetter.add(this.input.btnSend)('mouseup', clearPressTimer);
      this.input.listenerSetter.add(this.input.btnSend)('mouseleave', clearPressTimer);
    }
  }

  // The recording mode shown on the button. Locked to the active session's
  // type while recording (so resuming / sending uses the matching recorder);
  // otherwise driven by the persisted user preference.
  public getActiveRecordingMediaType(): 'voice' | 'video' {
    if(this.active) return this.recordingType;
    const persisted = this.input.chat?.appSettings?.recordingMediaType ?? 'voice';
    // If the persisted type isn't available on this device (e.g. no
    // MediaRecorder support for video), silently fall back to voice.
    if(persisted === 'video' && !this.videoRecorder) return 'voice';
    if(persisted === 'voice' && !this.recorder) return 'video';
    return persisted;
  }

  // Returns the recorder driving the current session (or undefined when not
  // recording). Used by the click handler to stop+send regardless of type.
  private getActiveRecorder(): {stop: () => void, pause?: () => void | Promise<void>, resume?: () => void, getSnapshot?: () => unknown} | undefined {
    if(!this.active) return undefined;
    return this.recordingType === 'video' ? this.videoRecorder : this.recorder;
  }

  private startRecordingNow(type: 'voice' | 'video') {
    // `this.active` only flips true once start() resolves; for video that
    // now includes waiting for the camera's first visible frame, a longer
    // window in which a second click could kick off a duplicate recording.
    // Guard it explicitly.
    if(this.active || this.isStartingRecording) return;
    if(type === 'video' && !this.videoRecorder) return;
    this.isStartingRecording = true;
    const promise = type === 'video' ? this.startVideoRecording() : this.startVoiceRecording();
    Promise.resolve(promise).catch(() => {}).finally(() => {
      this.isStartingRecording = false;
    });
  }

  private async startVoiceRecording() {
    const isAnyChat = this.input.chat.peerId.isAnyChat();
    const flag: ChatRights = 'send_voices';
    if(isAnyChat && !(await this.input.chat.canSend(flag))) {
      toastNew({langPackKey: POSTING_NOT_ALLOWED_MAP[flag]});
      return;
    }

    if(await this.input.showSlowModeTooltipIfNeeded()) {
      return;
    }

    this.input.chatInput.classList.add('is-locked');
    blurActiveElement();

    let restricted = false;
    if(!isAnyChat) {
      const userFull = await this.input.managers.appProfileManager.getProfile(this.input.chat.peerId.toUserId());
      if(userFull?.pFlags.voice_messages_forbidden) {
        toastNew({
          langPackKey: 'Chat.SendVoice.PrivacyError',
          langPackArguments: [await wrapPeerTitle({peerId: this.input.chat.peerId})]
        });
        restricted = true;
      }
    }

    if(restricted) {
      this.input.chatInput.classList.remove('is-locked');
      return;
    }

    this.recordingType = 'voice';

    // Record with the microphone selected in Settings → Speakers and Camera
    // (same appSettings.callDevices source as the call stack + the video note);
    // empty ⇒ OS default. Read fresh each time, applied to whichever recorder
    // backs this session: NativeVoiceRecorder via its setter, or the opus-recorder
    // fallback by setting the `config.mediaTrackConstraints` its start() reads.
    const microphoneId = appSettings.callDevices?.microphoneId;
    if(this.recorder.setMicrophoneId) {
      this.recorder.setMicrophoneId(microphoneId);
    } else if(this.recorder.config) {
      this.recorder.config.mediaTrackConstraints = microphoneId ? {deviceId: {exact: microphoneId}} : true;
    }

    this.recorder.start().then(() => {
      this.releaseMediaPlayback = appMediaPlaybackController.setSingleMedia();
      this.recordCanceled = false;
      this.recordPaused = false;
      this.recordAccumulatedMs = 0;

      this.setRecording(true);
      this.voiceRecordingPanel?.setMode('recording');
      this.voiceRecordingPanel?.clearPeaks();
      opusDecodeController.setKeepAlive(true);

      const showDiscardPopup = () => {
        PopupElement.createPopup(PopupPeer, 'popup-cancel-record', {
          titleLangKey: 'DiscardVoiceMessageTitle',
          descriptionLangKey: 'DiscardVoiceMessageDescription',
          buttons: [{
            langKey: 'DiscardVoiceMessageAction',
            callback: () => {
              simulateClickEvent(this.input.btnCancelRecord);
            }
          }, {
            langKey: 'Continue',
            isCancel: true
          }]
        }).show();
      };

      this.recordingOverlayListener = this.input.listenerSetter.add(document.body)('mousedown', (e) => {
        if(!findUpClassName(e.target, CLASS_NAME) && !findUpClassName(e.target, 'popup-cancel-record')) {
          cancelEvent(e);
          showDiscardPopup();
        }
      }, {capture: true, passive: false}) as any;

      appNavigationController.pushItem(this.recordingNavigationItem = {
        type: 'voice',
        onPop: () => {
          setTimeout(() => {
            showDiscardPopup();
          }, 0);

          return false;
        }
      });

      this.recordStartTime = Date.now();

      if(this.recorder instanceof NativeVoiceRecorder) {
        // Tap PCM from the capture worklet instead of adding two
        // ScriptProcessors on the main thread — that path starves encoding on
        // low-end mobile PWAs and shows up as crackling in the recording.
        this.waveformAnalyser = new VoiceWaveformAnalyser();
        this.liveWaveformAnalyser = new LiveWaveformAnalyser();
        this.recorder.notifySamples = (samples) => {
          this.waveformAnalyser?.feed(samples);
          this.liveWaveformAnalyser?.feed(samples);
        };
      } else {
        const sourceNode: MediaStreamAudioSourceNode = this.recorder.sourceNode;
        this.waveformAnalyser = new VoiceWaveformAnalyser(sourceNode);
        this.liveWaveformAnalyser = new LiveWaveformAnalyser(sourceNode);
      }
      this.liveWaveformAnalyser.onpeak = (peak) => {
        this.voiceRecordingPanel?.pushPeak(peak);
      };

      this.startRecordingTimerLoop();
    }).catch((e: Error) => {
      switch(e.name as string) {
        case 'NotAllowedError': {
          toastNew({langPackKey: 'NoMicrophoneAccess'});
          break;
        }

        case 'NotReadableError': {
          toast(e.message);
          break;
        }

        default:
          console.error('Recorder start error:', e, e.name, e.message);
          toast(e.message);
          break;
      }

      this.setRecording(false);
      this.input.chatInput.classList.remove('is-locked');
    });
  }

  private async startVideoRecording() {
    if(!this.videoRecorder) return;
    const isAnyChat = this.input.chat.peerId.isAnyChat();
    // Round video notes go through the same restriction set as voice (the
    // server-side flag is shared; clients gate on `send_voices`).
    const flag: ChatRights = 'send_voices';
    if(isAnyChat && !(await this.input.chat.canSend(flag))) {
      toastNew({langPackKey: POSTING_NOT_ALLOWED_MAP[flag]});
      return;
    }

    if(await this.input.showSlowModeTooltipIfNeeded()) {
      return;
    }

    this.input.chatInput.classList.add('is-locked');
    blurActiveElement();

    this.recordingType = 'video';

    // Record with the camera + microphone the user selected in Settings →
    // Speakers and Camera (the same appSettings.callDevices source the call
    // stack reads); empty string ⇒ OS default. Read fresh each time so a change
    // in settings takes effect on the next recording.
    this.videoRecorder.setDeviceIds(appSettings.callDevices?.cameraId, appSettings.callDevices?.microphoneId);

    try {
      await this.videoRecorder.start();
    } catch(e) {
      const err = e as Error;
      switch(err.name) {
        case 'NotAllowedError':
          toastNew({langPackKey: 'NoMicrophoneAccess'});
          break;
        case 'NotReadableError':
          toast(err.message);
          break;
        default:
          console.error('VideoRecorder start error:', err);
          // err.message is empty for some errors (OverconstrainedError /
          // NotFoundError) — fall back to the name so the toast isn't blank.
          toast(err.message || err.name);
          break;
      }
      this.setRecording(false);
      this.input.chatInput.classList.remove('is-locked');
      return;
    }

    this.releaseMediaPlayback = appMediaPlaybackController.setSingleMedia();
    this.recordCanceled = false;
    this.recordPaused = false;
    this.recordAccumulatedMs = 0;
    this.videoLimitReached = false;

    // The recording bar is the regular voice panel, IN PLACE in the chat input.
    // We just drive it for video; the only video-specific UI is the centered
    // round preview (videoRecordingPanel).
    this.setRecording(true);
    this.voiceRecordingPanel?.setMode('recording');
    this.voiceRecordingPanel?.clearPeaks();
    this.videoRecordingPanel?.setProgress(0);

    // Pipe the live camera into the 360x360 preview and reveal the circle only
    // once the first frame is actually painted — revealing immediately would
    // fade in a black circle while the camera spins up.
    this.videoRecordingPanel?.startLivePreview(this.videoRecorder.stream);

    // Live waveform: tap the captured audio track through a throwaway
    // AudioContext (MediaRecorder gives us no PCM). Mirror the voice flow —
    // feed normalized peaks into the (shared) voice panel's waveform.
    this.setupVideoWaveform();

    const showDiscardPopup = () => {
      PopupElement.createPopup(PopupPeer, 'popup-cancel-record', {
        titleLangKey: 'DiscardVoiceMessageTitle',
        descriptionLangKey: 'DiscardVoiceMessageDescription',
        buttons: [{
          langKey: 'DiscardVoiceMessageAction',
          callback: () => {
            simulateClickEvent(this.input.btnCancelRecord);
          }
        }, {
          langKey: 'Continue',
          isCancel: true
        }]
      }).show();
    };

    this.recordingOverlayListener = this.input.listenerSetter.add(document.body)('mousedown', (e) => {
      // Same dismiss-on-outside-click guard as voice — clicks inside the chat
      // input or the discard popup are allowed; everything else opens the
      // discard confirmation.
      if(
        !findUpClassName(e.target, CLASS_NAME) &&
        !findUpClassName(e.target, 'popup-cancel-record') &&
        !findUpClassName(e.target, 'video-recording-stage') // clicking the preview circle isn't "outside"
      ) {
        cancelEvent(e);
        showDiscardPopup();
      }
    }, {capture: true, passive: false}) as any;

    appNavigationController.pushItem(this.recordingNavigationItem = {
      type: 'voice',
      onPop: () => {
        setTimeout(() => {
          showDiscardPopup();
        }, 0);

        return false;
      }
    });

    this.recordStartTime = Date.now();
    this.startVideoRecordingTimerLoop();
  }

  // Opens an AudioContext on the recording stream's audio track and routes it
  // through the same analysers the voice flow uses, feeding the (shared) voice
  // panel waveform. Torn down in teardownVideoWaveform (on stop). Best-effort —
  // a waveform failure must not break the recording.
  private setupVideoWaveform() {
    if(!this.videoRecorder?.stream || !this.voiceRecordingPanel) return;
    const audioTracks = this.videoRecorder.stream.getAudioTracks();
    if(!audioTracks.length) return;
    try {
      this.videoAudioContext = new AudioContext();
      // Created after `await getUserMedia`, i.e. outside the original click
      // gesture, so it may start suspended — without resuming, the
      // ScriptProcessor never fires and the waveform stays flat.
      if(this.videoAudioContext.state === 'suspended') {
        this.videoAudioContext.resume().catch(() => {});
      }
      // Tap a CLONE of the audio track, not the one MediaRecorder is recording.
      // Sharing the single track between MediaRecorder and a Web Audio source
      // makes one of them read silence (flat waveform + soundless recording);
      // an independent clone feeds both with real audio.
      this.videoWaveformStream = new MediaStream([audioTracks[0].clone()]);
      const source = this.videoAudioContext.createMediaStreamSource(this.videoWaveformStream);
      // Full-recording peaks for the frozen pause view, live peaks for the
      // scrolling bars — same pair the voice recorder wires up.
      this.waveformAnalyser = new VoiceWaveformAnalyser(source);
      this.liveWaveformAnalyser = new LiveWaveformAnalyser(source);
      this.liveWaveformAnalyser.onpeak = (peak) => {
        if(this.recordingType === 'video') this.voiceRecordingPanel?.pushPeak(peak);
      };
    } catch(e) {
      console.error('[ChatInput] video waveform setup error:', e);
    }
  }

  private teardownVideoWaveform() {
    this.teardownLiveWaveform();
    if(this.waveformAnalyser) {
      this.waveformAnalyser.finish();
      this.waveformAnalyser = undefined;
    }
    if(this.videoWaveformStream) {
      this.videoWaveformStream.getTracks().forEach((t) => t.stop());
      this.videoWaveformStream = undefined;
    }
    if(this.videoAudioContext) {
      const ctx = this.videoAudioContext;
      this.videoAudioContext = undefined;
      if(ctx.state !== 'closed') ctx.close().catch(() => {});
    }
  }

  // Snapshot the current round-preview frame as a JPEG poster for the optimistic
  // message. Must be called while the camera is still live (we keep it alive
  // through the stop fade-out). Returns the {blob, url, size} shape sendFile's
  // `thumb` expects, or undefined on failure (sending still works without it).
  private async captureVideoPoster(): Promise<{blob: Blob, url: string, size: MediaSize} | undefined> {
    const v = this.videoRecordingPanel?.previewVideo;
    if(!v || !v.videoWidth || !v.videoHeight) return undefined;
    try {
      const poster = await createPosterFromMedia(v);
      if(!poster?.blob) return undefined;
      return {blob: poster.blob, url: URL.createObjectURL(poster.blob), size: poster.size};
    } catch(e) {
      return undefined;
    }
  }

  private onVideoPlaybackSeek(progress: number) {
    const video = this.videoRecordingPanel?.previewVideo;
    if(!video) return;
    const seekTo = () => {
      const dur = this.getVideoPreviewDurationSec();
      if(!dur) return;
      video.currentTime = Math.max(0, Math.min(dur, progress * dur));
      this.voiceRecordingPanel?.setPlaybackProgress(progress);
      this.videoRecordingPanel?.setProgress(progress);
    };
    // No preview mounted yet (still showing the live camera) — start playback
    // and seek once it's loaded.
    if(video.srcObject || !video.src) {
      this.startVideoPlaybackFromSnapshot();
      const onMeta = () => {
        seekTo();
        video.removeEventListener('loadedmetadata', onMeta);
      };
      video.addEventListener('loadedmetadata', onMeta);
      return;
    }
    seekTo();
    if(video.paused) video.play().catch(() => {});
  }

  public destroy() {
    // The round-preview element lives on <body>, outside the input subtree, so
    // tear it down explicitly. Also release the camera in case a recording (or
    // its warm-up) is still in flight.
    this.teardownVideoWaveform();
    // stopVideoPlayback before the panel goes away: cancels the playback rAF and
    // revokes videoPlaybackObjectUrl (it reads videoRecordingPanel.previewVideo).
    this.stopVideoPlayback();
    this.videoRecorder?.releaseStream();
    // A recording in flight pushed a navigation item with an onPop discard popup;
    // drop it so it doesn't linger / fire after the chat is gone.
    if(this.recordingNavigationItem) {
      appNavigationController.removeItem(this.recordingNavigationItem);
      this.recordingNavigationItem = undefined;
    }
    this.videoRecordingPanel?.destroy();
    this.videoRecordingPanel = undefined;
  }
}
