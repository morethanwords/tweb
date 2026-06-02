import {InputDocument} from '@layer';
import type {MyDocument} from '@appManagers/appDocsManager';
import getDocumentInput from '@appManagers/utils/docs/getDocumentInput';
import ListenerSetter from './listenerSetter';

/**
 * Tracks how much of a music track the user actually listened to and reports it via
 * `messages.reportMusicListen`. The listened duration is the total of the UNIQUE track positions
 * the user covered (re-listening the same segment isn't counted twice, and seek jumps are excluded)
 * — matching the Android client.
 *
 * Driven by {@link AppMediaPlaybackController}: call {@link onPlay} on each `play` event (passing the
 * controller's playing details) and {@link finish} on `stop`. A session begins when a music track
 * starts and is finalized — and reported, when long enough — on track switch, stop, or a pause
 * longer than {@link MUSIC_LISTEN_PAUSE_LIMIT}.
 */

// A pause longer than this ends the current listen; resuming afterwards counts as a new one.
const MUSIC_LISTEN_PAUSE_LIMIT = 60e3;
// The server ignores reports shorter than this many seconds, so we don't bother sending them.
const MUSIC_LISTEN_MIN_DURATION = 3;

type MusicListenSession = {
  inputDoc: InputDocument.inputDocument,
  media: HTMLMediaElement,
  listeners: ListenerSetter,
  ranges: {from: number, to: number}[],
  rangeStart: number,
  lastPosition: number
};

type PlayDetails = {
  doc?: MyDocument,
  media?: HTMLMediaElement
};

export default class MusicListenTracker {
  // `ranges` holds the merged covered intervals (seconds), `rangeStart` is the open interval's start
  // (-1 when none), `lastPosition` is the last observed playback position (used to close ranges
  // across seeks/stop).
  private session: MusicListenSession;
  private pauseTimeout: number;

  constructor(private onReport: (inputDoc: InputDocument.inputDocument, listenedDuration: number) => void) {}

  public onPlay(details: PlayDetails) {
    // Only music is tracked — switching away from music to a voice/round/video finalizes any session.
    if(details?.doc?.type !== 'audio') {
      this.finish();
      return;
    }

    const inputDoc = getDocumentInput(details.doc) as InputDocument.inputDocument;
    const session = this.session;
    if(session && session.inputDoc.id === inputDoc.id && session.media === details.media) {
      // Same track still playing (e.g. resume) — the media-level listeners handle it.
      return;
    }

    // A different track started — finalize the previous listen and begin a fresh one.
    this.finish();
    this.startSession(inputDoc, details.media);
  }

  // Settles the current listen and reports it (when long enough), then clears it. Called when a
  // track ends, the user switches tracks, the player is closed, or a pause lasts longer than
  // MUSIC_LISTEN_PAUSE_LIMIT.
  public finish() {
    this.clearPauseTimeout();

    const session = this.session;
    if(!session) {
      return;
    }

    this.session = undefined;
    session.listeners.removeAll();

    // Close a still-open interval at the last known position. `media.currentTime` is unreliable
    // here — `stop()` resets it to 0 before dispatching the event — so use `lastPosition`.
    this.closeRange(session, session.lastPosition);

    let total = 0;
    for(const range of session.ranges) {
      total += range.to - range.from;
    }

    const listenedDuration = Math.floor(total);
    if(listenedDuration < MUSIC_LISTEN_MIN_DURATION) {
      return;
    }

    this.onReport(session.inputDoc, listenedDuration);
  }

  private startSession(inputDoc: InputDocument.inputDocument, media: HTMLMediaElement) {
    const listeners = new ListenerSetter();
    const session: MusicListenSession = this.session = {
      inputDoc,
      media,
      listeners,
      ranges: [],
      rangeStart: -1,
      lastPosition: media.currentTime
    };

    // The media is already playing when the controller's `play` event reaches us, so open the
    // first interval right away; later play/pause/seek transitions adjust it.
    if(!media.paused) {
      this.openRange(media.currentTime);
    }

    listeners.add(media)('timeupdate', () => {
      session.lastPosition = media.currentTime;
    });

    listeners.add(media)('play', () => {
      this.clearPauseTimeout();
      this.openRange(media.currentTime);
    });

    listeners.add(media)('pause', () => {
      // `stop()` resets currentTime to 0 before this async event fires, so fall back to the last
      // tracked position; on a genuine user pause currentTime is accurate and slightly ahead.
      this.closeRange(session, Math.max(session.lastPosition, media.currentTime));
      this.clearPauseTimeout();
      this.pauseTimeout = window.setTimeout(() => {
        this.pauseTimeout = undefined;
        this.finish();
      }, MUSIC_LISTEN_PAUSE_LIMIT);
    });

    listeners.add(media)('seeking', () => {
      // Close the interval at the pre-seek position, then reopen at the new one if still playing.
      this.closeRange(session, session.lastPosition);
      this.clearPauseTimeout();
      if(!media.paused) {
        this.openRange(media.currentTime);
      }
      session.lastPosition = media.currentTime;
    });
  }

  // Opens a covered interval at the given position (no-op if one is already open).
  private openRange(position: number) {
    const session = this.session;
    if(session && session.rangeStart < 0) {
      session.rangeStart = position;
    }
  }

  // Closes the open interval at the given position and merges it into the covered ranges.
  private closeRange(session: MusicListenSession, position: number) {
    if(session.rangeStart < 0) {
      return;
    }

    const from = session.rangeStart;
    session.rangeStart = -1;
    if(position <= from) {
      return;
    }

    // Insert sorted by `from`, then merge any overlapping/touching neighbours.
    const ranges = session.ranges;
    let idx = 0;
    while(idx < ranges.length && ranges[idx].from <= from) idx++;
    ranges.splice(idx, 0, {from, to: position});
    for(let i = Math.max(0, idx - 1); i < ranges.length - 1;) {
      const cur = ranges[i], next = ranges[i + 1];
      if(cur.to >= next.from) {
        cur.to = Math.max(cur.to, next.to);
        ranges.splice(i + 1, 1);
      } else {
        i++;
      }
    }
  }

  private clearPauseTimeout() {
    if(this.pauseTimeout !== undefined) {
      clearTimeout(this.pauseTimeout);
      this.pauseTimeout = undefined;
    }
  }
}
