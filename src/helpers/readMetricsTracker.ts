import {InputMessageReadMetric} from '@layer';
import {randomLong} from './random';
import clamp from './number/clamp';

/**
 * Port of tdesktop's `HistoryView::ReadMetricsTracker` (history_view_read_metrics_tracker.cpp):
 * collects per-post engagement metrics (`messages.reportReadMetrics`) while channel posts are in
 * the viewport.
 *
 * The DOM layer drives it with a batch each time visibility may have changed — call
 * {@link startBatch}, then {@link push} for every channel post currently overlapping the viewport
 * (with its top/height in the SAME coordinate space as the viewport bounds passed to startBatch),
 * then {@link endBatch}. Between batches an internal timer advances grace periods, accumulates
 * in-view time and enforces the max-duration cap. Finalized metrics are handed to `onFinalize`.
 *
 * Coordinate space is arbitrary but must be consistent within a batch; this port uses client
 * (getBoundingClientRect) pixels.
 */

const GRACE_PERIOD = 300;
const ACTIVITY_TIMEOUT = 15 * 1000;
const MAX_TRACKING_DURATION = 5 * 60 * 1000;
const MIN_REPORT_THRESHOLD = 300;

export type FinalizedReadMetric = {
  peerId: PeerId,
  metric: Omit<InputMessageReadMetric.inputMessageReadMetric, '_'>
};

type TrackedItem = {
  peerId: PeerId,
  viewId: string,
  entryGraceStart: number,
  trackingStarted: number,
  lastUpdate: number,
  totalInView: number,
  activeInView: number,
  seenTop: number,
  seenBottom: number,
  maxItemHeight: number,
  maxViewportHeight: number,
  entryGracePending: boolean,
  exitGracePending: boolean,
  exitGraceStart: number
};

export default class ReadMetricsTracker {
  private tracked: Map<number, TrackedItem> = new Map();
  private currentlyVisible: Set<number> = new Set();

  private batchNow = 0;
  private batchPeerId: PeerId;
  private batchViewportHeight = 0;
  private batchVisibleTop = 0;
  private batchVisibleBottom = 0;
  private batchVisible: Set<number> = new Set();

  private lastActivity = 0;
  private appActive = true;
  private screenActive = true;
  private paused = false;
  private pausedSince = 0;
  private timeout: number;

  constructor(private onFinalize: (finalized: FinalizedReadMetric) => void) {}

  public startBatch(peerId: PeerId, visibleTop: number, visibleBottom: number) {
    this.batchNow = Date.now();
    this.sync(this.batchNow);
    this.batchPeerId = peerId;
    this.batchViewportHeight = visibleBottom - visibleTop;
    this.batchVisibleTop = visibleTop;
    this.batchVisibleBottom = visibleBottom;
    this.batchVisible.clear();
  }

  public push(msgId: number, itemTop: number, itemHeight: number) {
    this.batchVisible.add(msgId);

    const clippedTop = Math.max(itemTop, this.batchVisibleTop) - itemTop;
    const clippedBottom = Math.min(itemTop + itemHeight, this.batchVisibleBottom) - itemTop;

    const addTracked = () => {
      this.tracked.set(msgId, {
        peerId: this.batchPeerId,
        viewId: '',
        entryGraceStart: this.batchNow,
        trackingStarted: 0,
        lastUpdate: 0,
        totalInView: 0,
        activeInView: 0,
        seenTop: clippedTop,
        seenBottom: clippedBottom,
        maxItemHeight: itemHeight,
        maxViewportHeight: this.batchViewportHeight,
        entryGracePending: true,
        exitGracePending: false,
        exitGraceStart: 0
      });
    };

    const tracked = this.tracked.get(msgId);
    if(!tracked) {
      addTracked();
      return;
    }

    if(tracked.exitGracePending) {
      if(this.batchNow - tracked.exitGraceStart >= GRACE_PERIOD) {
        this.finalize(msgId, tracked);
        this.tracked.delete(msgId);
        addTracked();
        return;
      }

      tracked.exitGracePending = false;
      tracked.exitGraceStart = 0;
      tracked.lastUpdate = this.batchNow;
    }

    tracked.seenTop = Math.min(tracked.seenTop, clippedTop);
    tracked.seenBottom = Math.max(tracked.seenBottom, clippedBottom);
    tracked.maxItemHeight = Math.max(tracked.maxItemHeight, itemHeight);
    tracked.maxViewportHeight = Math.max(tracked.maxViewportHeight, this.batchViewportHeight);
  }

  public endBatch() {
    for(const [msgId, tracked] of this.tracked) {
      if(this.batchVisible.has(msgId)) {
        continue;
      }

      if(tracked.entryGracePending) {
        this.tracked.delete(msgId);
        continue;
      }

      if(!tracked.exitGracePending) {
        tracked.exitGracePending = true;
        tracked.exitGraceStart = this.batchNow;
      }
    }

    const previous = this.currentlyVisible;
    this.currentlyVisible = this.batchVisible;
    this.batchVisible = previous;
    this.batchVisible.clear();
    this.restartTimer();
  }

  public registerActivity() {
    if(!this.appActive || !this.screenActive) {
      return;
    }

    const now = Date.now();
    const activityDeadline = this.activeUntil();
    if(activityDeadline && activityDeadline < now) {
      this.sync(now);
    }

    this.lastActivity = now;
    this.restartTimer();
  }

  public setAppActive(active: boolean) {
    if(this.appActive === active) {
      return;
    }

    this.appActive = active;
    this.refreshPaused(Date.now());
  }

  public setScreenActive(active: boolean) {
    if(this.screenActive === active) {
      return;
    }

    this.screenActive = active;
    this.refreshPaused(Date.now());
  }

  // Finalizes (and reports, if long enough) every tracked post and stops the timer. Call when the
  // screen is destroyed or its content (peer) is replaced.
  public finalizeAll() {
    this.sync(Date.now());
    for(const [msgId, tracked] of this.tracked) {
      this.finalize(msgId, tracked);
    }

    this.tracked.clear();
    this.currentlyVisible.clear();
    this.clearTimeout();
  }

  private onTimeout = () => {
    this.timeout = undefined;
    this.sync(Date.now());
  };

  private sync(now: number) {
    const activeUntil = this.activeUntil();
    this.processTransitions(now, activeUntil);
    this.accumulate(now, activeUntil);
    this.restartTimer();
  }

  private processTransitions(now: number, activeUntil: number) {
    for(const [msgId, tracked] of this.tracked) {
      if(tracked.entryGracePending && !this.paused && now - tracked.entryGraceStart >= GRACE_PERIOD) {
        tracked.entryGracePending = false;
        tracked.viewId = randomLong();
        tracked.trackingStarted = tracked.entryGraceStart;
        tracked.lastUpdate = tracked.trackingStarted;
      }

      if(tracked.exitGracePending && !this.paused && now - tracked.exitGraceStart >= GRACE_PERIOD) {
        this.finalize(msgId, tracked);
        this.tracked.delete(msgId);
        continue;
      }

      if(tracked.viewId && !tracked.entryGracePending && !tracked.exitGracePending) {
        const deadline = tracked.trackingStarted + MAX_TRACKING_DURATION;
        if(now >= deadline) {
          if(!this.paused && this.currentlyVisible.has(msgId) && tracked.lastUpdate < deadline) {
            this.addElapsed(tracked, tracked.lastUpdate, deadline, activeUntil);
            tracked.lastUpdate = deadline;
          }

          this.finalize(msgId, tracked);
          this.tracked.delete(msgId);
          continue;
        }
      }
    }
  }

  private accumulate(now: number, activeUntil: number) {
    for(const [msgId, tracked] of this.tracked) {
      if(!tracked.viewId || tracked.entryGracePending || tracked.exitGracePending || tracked.lastUpdate <= 0) {
        continue;
      }

      if(this.paused || !this.currentlyVisible.has(msgId)) {
        tracked.lastUpdate = now;
        continue;
      }

      this.addElapsed(tracked, tracked.lastUpdate, now, activeUntil);
      tracked.lastUpdate = now;
    }
  }

  private refreshPaused(now: number) {
    const paused = !this.appActive || !this.screenActive;
    if(this.paused === paused) {
      return;
    }

    if(paused) {
      const activeUntil = this.activeUntil();
      this.processTransitions(now, activeUntil);
      this.accumulate(now, activeUntil);
      this.pausedSince = now;
      for(const [, tracked] of this.tracked) {
        if(tracked.entryGracePending || tracked.exitGracePending) {
          continue;
        }

        tracked.lastUpdate = now;
      }
    } else {
      const delta = now - this.pausedSince;
      for(const [, tracked] of this.tracked) {
        if(tracked.entryGracePending) {
          tracked.entryGraceStart = tracked.entryGraceStart < this.pausedSince ? tracked.entryGraceStart + delta : now;
        } else if(tracked.exitGracePending) {
          tracked.exitGraceStart = tracked.exitGraceStart < this.pausedSince ? tracked.exitGraceStart + delta : now;
        } else if(tracked.viewId) {
          tracked.lastUpdate = now;
        }
      }

      this.pausedSince = 0;
    }

    this.paused = paused;
    this.restartTimer();
  }

  private restartTimer() {
    if(!this.tracked.size) {
      this.clearTimeout();
      return;
    }

    const now = Date.now();
    let nearest = 0;
    const updateNearest = (deadline: number) => {
      if(!deadline) {
        return;
      }

      if(!nearest || deadline < nearest) {
        nearest = deadline;
      }
    };

    const activityDeadline = this.activeUntil();
    for(const [msgId, tracked] of this.tracked) {
      if(tracked.entryGracePending && !this.paused) {
        updateNearest(tracked.entryGraceStart + GRACE_PERIOD);
      } else if(tracked.exitGracePending && !this.paused) {
        updateNearest(tracked.exitGraceStart + GRACE_PERIOD);
      } else if(tracked.viewId) {
        updateNearest(tracked.trackingStarted + MAX_TRACKING_DURATION);
        if(!this.paused && this.currentlyVisible.has(msgId) && activityDeadline > now) {
          updateNearest(activityDeadline);
        }
      }
    }

    if(!nearest) {
      this.clearTimeout();
      return;
    }

    this.clearTimeout();
    this.timeout = self.setTimeout(this.onTimeout, Math.max(nearest - now, 0));
  }

  private clearTimeout() {
    if(this.timeout !== undefined) {
      self.clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  }

  private activeUntil() {
    return this.lastActivity ? this.lastActivity + ACTIVITY_TIMEOUT : 0;
  }

  private addElapsed(tracked: TrackedItem, from: number, till: number, activeUntil: number) {
    if(till <= from) {
      return;
    }

    tracked.totalInView += till - from;
    if(activeUntil > from) {
      tracked.activeInView += Math.max(Math.min(till, activeUntil) - from, 0);
      tracked.activeInView = Math.min(tracked.activeInView, tracked.totalInView);
    }
  }

  private finalize(msgId: number, tracked: TrackedItem) {
    if(!tracked.viewId || tracked.totalInView < MIN_REPORT_THRESHOLD) {
      return;
    }

    const heightRatio = tracked.maxViewportHeight > 0 ?
      Math.round(tracked.maxItemHeight * 1000 / tracked.maxViewportHeight) :
      0;
    const seenRange = tracked.maxItemHeight > 0 ?
      clamp(Math.round((tracked.seenBottom - tracked.seenTop) * 1000 / tracked.maxItemHeight), 0, 1000) :
      0;

    this.onFinalize({
      peerId: tracked.peerId,
      metric: {
        msg_id: msgId,
        view_id: tracked.viewId,
        time_in_view_ms: Math.round(tracked.totalInView),
        active_time_in_view_ms: Math.round(tracked.activeInView),
        height_to_viewport_ratio_permille: heightRatio,
        seen_range_ratio_permille: seenRange
      }
    });
  }
}
