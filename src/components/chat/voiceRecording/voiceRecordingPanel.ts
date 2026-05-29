// Self-contained recording UI overlay shown in the chat input while the user
// is recording (or has paused) a voice message. The whole subtree lives inside
// one absolutely-positioned container so the chat input can fade or slide it
// in/out atomically.
//
// Layout while recording:
//   [trash] [● red dot] [waveform .....................] [timer] [pause]
// Layout while paused / playing back:
//   [trash] [play/pause] [waveform .....................] [timer] [microphone]
//
// External wiring:
//   * pushPeak()           — call for every live amplitude during recording.
//   * setPeaks()           — replace buffer with the full recording (used for
//                            the static playback view once paused).
//   * setTimer()           — update the timer text (MM:SS,CS).
//   * setMode()            — switch between recording / paused (+ playing).
//   * setPlaybackProgress  — drives the playhead overlay during playback.
//   * onCancel             — discard recording.
//   * onPauseToggle        — pause while recording / resume recording while paused.
//   * onPlayToggle         — playback / pause playback (paused mode only).

import Icon from '@components/icon';
import Button from '@components/button';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import ListenerSetter from '@helpers/listenerSetter';
import LiveWaveform from './liveWaveform';

export interface VoiceRecordingPanelOptions {
  onCancel: () => void;
  onPauseToggle: () => void;
  onPlayToggle: () => void;
  onSeek: (progress: number) => void;
}

export type VoiceRecordingMode = 'recording' | 'paused';

export default class VoiceRecordingPanel {
  public element: HTMLDivElement;
  public waveform: LiveWaveform;

  private btnCancel: HTMLButtonElement;
  // Pill container that holds the lead + waveform on a tinted background.
  private pillEl: HTMLDivElement;
  // Left-of-waveform slot — red dot while recording, play/pause while paused.
  private leadEl: HTMLDivElement;
  private dotEl: HTMLDivElement;
  private btnPlayToggle: HTMLButtonElement;
  private playPlayIcon: HTMLElement;
  private playPauseIcon: HTMLElement;
  // Right-of-timer slot — pause while recording, microphone while paused.
  private btnPauseToggle: HTMLButtonElement;
  private pauseIconRecord: HTMLElement;
  private pauseIconMic: HTMLElement;

  private timerEl: HTMLSpanElement;
  private listenerSetter = new ListenerSetter();
  private mode: VoiceRecordingMode = 'recording';
  private isPlaying = false;

  constructor(opts: VoiceRecordingPanelOptions) {
    this.element = document.createElement('div');
    this.element.classList.add('voice-recording-panel');

    this.btnCancel = Button('btn-icon voice-recording-cancel danger');
    this.btnCancel.append(Icon('delete', 'voice-recording-cancel-icon'));

    this.leadEl = document.createElement('div');
    this.leadEl.classList.add('voice-recording-lead');

    this.dotEl = document.createElement('div');
    this.dotEl.classList.add('voice-recording-dot');

    this.btnPlayToggle = Button('btn-icon voice-recording-play');
    this.playPlayIcon = Icon('play', 'voice-recording-play-icon', 'voice-recording-play-icon--play');
    this.playPauseIcon = Icon('pause', 'voice-recording-play-icon', 'voice-recording-play-icon--pause');
    this.btnPlayToggle.append(this.playPlayIcon, this.playPauseIcon);

    this.leadEl.append(this.dotEl, this.btnPlayToggle);

    this.waveform = new LiveWaveform();

    this.timerEl = document.createElement('span');
    this.timerEl.classList.add('voice-recording-timer');
    this.timerEl.textContent = '0:00,0';

    this.btnPauseToggle = Button('btn-icon voice-recording-pause-toggle');
    this.pauseIconRecord = Icon('pause', 'voice-recording-pause-icon', 'voice-recording-pause-icon--pause');
    this.pauseIconMic = Icon('microphone', 'voice-recording-pause-icon', 'voice-recording-pause-icon--mic');
    this.btnPauseToggle.append(this.pauseIconRecord, this.pauseIconMic);

    this.pillEl = document.createElement('div');
    this.pillEl.classList.add('voice-recording-pill');
    this.pillEl.append(this.leadEl, this.waveform.element, this.timerEl);

    this.element.append(
      this.btnCancel,
      this.pillEl,
      this.btnPauseToggle
    );

    attachClickEvent(this.btnCancel, (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      opts.onCancel();
    }, {listenerSetter: this.listenerSetter});

    attachClickEvent(this.btnPauseToggle, (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      opts.onPauseToggle();
    }, {listenerSetter: this.listenerSetter});

    attachClickEvent(this.btnPlayToggle, (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      opts.onPlayToggle();
    }, {listenerSetter: this.listenerSetter});

    this.waveform.onSeek = (progress) => opts.onSeek(progress);

    this.setMode('recording');
  }

  public setMode(mode: VoiceRecordingMode) {
    this.mode = mode;
    this.element.classList.toggle('voice-recording-panel--paused', mode === 'paused');
    this.element.classList.toggle('voice-recording-panel--recording', mode === 'recording');
    if(mode === 'recording') {
      this.setPlaying(false);
      this.waveform.setProgress(undefined);
    }
  }

  public getMode(): VoiceRecordingMode {
    return this.mode;
  }

  public setPlaying(isPlaying: boolean) {
    this.isPlaying = isPlaying;
    this.element.classList.toggle('voice-recording-panel--playing', isPlaying);
  }

  public setSeekable(seekable: boolean) {
    this.waveform.setSeekable(seekable);
  }

  public getIsPlaying() {
    return this.isPlaying;
  }

  public setPlaybackProgress(progress: number | undefined) {
    this.waveform.setProgress(progress);
  }

  public setTimer(text: string) {
    if(this.timerEl.textContent !== text) this.timerEl.textContent = text;
  }

  public pushPeak(value: number) {
    this.waveform.pushPeak(value);
  }

  public setPeaks(peaks: ArrayLike<number>) {
    this.waveform.setPeaks(peaks);
  }

  public clearPeaks() {
    this.waveform.clear();
  }

  public destroy() {
    this.listenerSetter.removeAll();
    this.waveform.destroy();
    this.element.remove();
  }
}
