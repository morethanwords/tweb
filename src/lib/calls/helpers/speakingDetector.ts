/**
 * "Is this participant speaking right now", from periodically sampled audio
 * levels. A key counts as speaking from the first sample above the threshold
 * until it has stayed below it for the hold time, so the indicator neither
 * flickers between syllables nor lags a second behind the first word.
 *
 * Levels are linear 0..1 — RFC 6464 for remote sources
 * (RTCRtpSynchronizationSource.audioLevel), RMS of the microphone for us.
 * Threshold and hold follow the native apps: Telegram iOS treats tgcalls'
 * level > 0.1 as speech (PresentationGroupCall.swift SpeakingParticipantsContext),
 * and tgcalls reports that level doubled (GroupInstanceCustomImpl.cpp
 * mappedAudioLevel), i.e. 0.05 on the RTP scale ≈ -26 dBov; tdesktop keeps a
 * sound status for 1.5 s (data_group_call.h kSoundStatusKeptFor).
 */
export const SPEAKING_LEVEL_THRESHOLD = 0.05;
export const SPEAKING_HOLD_MS = 1500;
export const SPEAKING_POLL_INTERVAL_MS = 150;

export default class SpeakingDetector<Key> {
  private lastSpokeAt = new Map<Key, number>();
  private interval: number | undefined;

  constructor(private options: {
    sample: () => Iterable<readonly [Key, number]>,
    onChange: (key: Key, speaking: boolean) => void,
    threshold?: number,
    holdMs?: number,
    intervalMs?: number,
    now?: () => number
  }) {}

  public get isRunning() {
    return this.interval !== undefined;
  }

  public start() {
    if(this.interval !== undefined) {
      return;
    }

    this.interval = window.setInterval(() => this.tick(), this.options.intervalMs ?? SPEAKING_POLL_INTERVAL_MS);
  }

  /** Stops sampling; everyone still marked as speaking is reported silent. */
  public stop() {
    if(this.interval !== undefined) {
      clearInterval(this.interval);
      this.interval = undefined;
    }

    const speaking = [...this.lastSpokeAt.keys()];
    this.lastSpokeAt.clear();
    speaking.forEach((key) => this.options.onChange(key, false));
  }

  public isSpeaking(key: Key) {
    return this.lastSpokeAt.has(key);
  }

  /** Forget a key at once (left the call, muted) instead of waiting for the hold. */
  public reset(key: Key) {
    if(this.lastSpokeAt.delete(key)) {
      this.options.onChange(key, false);
    }
  }

  public tick() {
    const now = this.options.now?.() ?? performance.now();
    const threshold = this.options.threshold ?? SPEAKING_LEVEL_THRESHOLD;
    const holdMs = this.options.holdMs ?? SPEAKING_HOLD_MS;

    let samples: Iterable<readonly [Key, number]>;
    try {
      samples = this.options.sample();
    } catch(err) {
      // A sampler that cannot read this tick (a connection mid-teardown) only
      // means nobody gets marked as speaking; holds still expire below.
      samples = [];
    }

    for(const [key, level] of samples) {
      if(!(level > threshold)) {
        continue;
      }

      const wasSpeaking = this.lastSpokeAt.has(key);
      this.lastSpokeAt.set(key, now);
      if(!wasSpeaking) {
        this.options.onChange(key, true);
      }
    }

    const expired: Key[] = [];
    this.lastSpokeAt.forEach((spokeAt, key) => {
      if(now - spokeAt > holdMs) {
        expired.push(key);
      }
    });

    expired.forEach((key) => {
      this.lastSpokeAt.delete(key);
      this.options.onChange(key, false);
    });
  }
}
