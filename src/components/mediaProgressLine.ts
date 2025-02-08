/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import createElementFromMarkup from '../helpers/createElementFromMarkup';
import {GrabEvent} from '../helpers/dom/attachGrabListeners';
import safePlay from '../helpers/dom/safePlay';
import setCurrentTime from '../helpers/dom/setCurrentTime';
import limitSymbols from '../helpers/string/limitSymbols';
import toHHMMSS from '../helpers/string/toHHMMSS';
import appMediaPlaybackController from './appMediaPlaybackController';
import {VideoTimestamp} from './appMediaViewerBase';
import RangeSelector from './rangeSelector';
import {observeResize} from './resizeObserver';

const MIN_VIDEO_TIMESTAMP_SEGMENT_WIDTH = 7; // -2px padding will be 5px

type VideoTimestampSegment = {
  time: number;
  left: number;
  right: number;
}

export default class MediaProgressLine extends RangeSelector {
  protected filledContainer?: HTMLDivElement;
  protected filledLoad: HTMLDivElement;

  protected currentTimeInfoElement?: HTMLDivElement;
  protected currentTimeElement?: HTMLDivElement;
  protected currentSegmentElement?: HTMLDivElement;

  protected progressRAF: number;

  protected media: HTMLMediaElement;
  protected streamable: boolean;

  protected static svgClipPathIdSeed = 0;
  protected usedClipPathId: number;
  protected clipPathSvg: SVGSVGElement;

  protected segments: VideoTimestampSegment[] = [];
  // protected lastOnPlayTime: number;
  // protected lastOnPlayCurrentTime: number;

  constructor(protected options: {
    withTransition?: boolean,
    useTransform?: boolean,
    onSeekStart?: () => void,
    onSeekEnd?: () => void,
    onTimeUpdate?: (time: number) => void,
    videoTimestamps?: VideoTimestamp[]
  } = {}) {
    super({
      step: 1000 / 60 / 1000,
      min: 0,
      max: 1,
      withTransition: options.withTransition,
      useTransform: options.useTransform
    }, 0);
  }

  public setMedia({
    media,
    streamable,
    duration
  }: {
    media: HTMLMediaElement,
    streamable?: boolean,
    duration?: number
  }) {
    if(this.media) {
      this.removeListeners();
    }

    if(streamable && !this.filledLoad) {
      this.filledLoad = document.createElement('div');
      this.filledLoad.classList.add('progress-line__filled', 'progress-line__loaded');
      this.container.prepend(this.filledLoad);
      // this.setLoadProgress();
    } else if(this.filledLoad) {
      this.filledLoad.classList.toggle('hide', !streamable);
    }

    this.media = media;
    this.streamable = streamable;
    if(!media.paused || media.currentTime > 0) {
      this.onPlay();
    }

    this.setTimestampsClipPath();

    let wasPlaying = false;
    this.setSeekMax(duration);
    this.setListeners();
    this.setHandlers({
      onMouseDown: () => {
        wasPlaying = !this.media.paused;
        wasPlaying && this.media.pause();
        this.options?.onSeekStart?.();
        this.container.classList.add('media-progress-line--seeking');
      },

      onMouseUp: (e) => {
        // cancelEvent(e.event);
        wasPlaying && safePlay(this.media);
        this.options?.onSeekEnd?.();
        this.container.classList.remove('media-progress-line--seeking');
      }
    });
  }

  protected unobserveResize?: () => void;
  protected initResizeObserver() {
    this.unobserveResize?.();
    this.unobserveResize = observeResize(this.filledContainer, () => {
      this.setTimestampsClipPath();
    });
  }

  protected activeSegmentIdx: number | null = null;
  protected hoverRAF: number;

  protected onHover = (e: MouseEvent) => {
    if(this.hoverRAF) return;

    if(this.activeSegmentIdx != null) this.toggleSegment(this.activeSegmentIdx, false);

    const bcr = this.filledContainer.getBoundingClientRect();
    const x = e.clientX - bcr.left;

    const segmentIdx = this.segments.findIndex((segment) => segment.left <= x && x <= segment.right);
    if(segmentIdx >= 0) {
      this.activeSegmentIdx = segmentIdx;
      this.toggleSegment(segmentIdx, true);
    }

    this.updateTimeAndSegment(x, bcr.width);
  }

  protected onPointerOut = () => {
    this.toggleSegment(this.activeSegmentIdx, false);
    this.activeSegmentIdx = null;
  }

  protected toggleSegment(idx: number, active: boolean) {
    const element = this.clipPathSvg.querySelector(`rect:nth-child(${idx + 1})`);

    if(active) element?.setAttribute('data-active', 'true');
    else element?.removeAttribute('data-active');
  }


  protected wrapProgressLinesInContainer() {
    if(this.filledContainer) return;
    this.container.classList.add('media-progress-line');

    this.filledContainer = document.createElement('div');
    this.filledContainer.classList.add('media-progress-line__filled-container');

    const thumb = document.createElement('div');
    thumb.classList.add('media-progress-line__thumb');

    this.currentTimeInfoElement = document.createElement('div');
    this.currentTimeInfoElement.classList.add('media-progress-line__current-time-info');

    this.currentTimeElement = document.createElement('div');
    this.currentTimeInfoElement.classList.add('media-progress-line__current-time');

    this.currentSegmentElement = document.createElement('div');
    this.currentTimeInfoElement.classList.add('media-progress-line__current-segment');

    this.currentTimeInfoElement.append(this.currentSegmentElement, this.currentTimeElement);

    this.filledContainer.append(this.filled, this.filledLoad);

    this.container.prepend(this.filledContainer);
    this.container.append(thumb, this.currentTimeInfoElement);

    this.container.addEventListener('pointermove', this.onHover);
    this.container.addEventListener('pointerout', this.onPointerOut);

    this.initResizeObserver();
  }

  protected clearTimeAndSegment() {
    this.currentTimeElement.textContent = '';
    this.currentSegmentElement.textContent = '';
  }

  protected updateTimeAndSegment(x: number, width: number) {
    if(!this.media || !this.currentTimeInfoElement) return;

    if(x < 0 || x > width) {
      this.clearTimeAndSegment();
      return;
    }

    const formattedTime = toHHMMSS(x / width * this.media.duration | 0);
    this.currentTimeElement.textContent = formattedTime;

    if(this.segments?.length > 0) {
      const segment = this.segments.find((segment) => segment.left <= x && x <= segment.right);
      const timestamp = this.options.videoTimestamps?.find((timestamp) => timestamp.time === segment.time);
      this.currentSegmentElement.textContent = limitSymbols(timestamp?.text || '', 24, 27);
    }

    const infoBcr = this.currentTimeInfoElement.getBoundingClientRect();

    const pushFromRight = Math.min(0, width - (x + infoBcr.width / 2));
    const pushFromLeft = Math.max(0, infoBcr.width / 2 - x);

    this.currentTimeInfoElement.style.setProperty('--current-time-info-x', x + pushFromLeft + pushFromRight + 'px');
  }

  protected setTimestampsClipPath() {
    this.removeClipPathFromDOM();
    this.segments = [];

    if(!this.options.videoTimestamps?.length) return;

    this.wrapProgressLinesInContainer();

    const bcr = this.filledContainer.getBoundingClientRect();
    const totalWidth = bcr.width;

    const segments = this.segments = this.getTimestampSegments(totalWidth);
    if(!segments?.length) return;

    const margin = 1;

    const rects = segments.map((segment) => `<rect x="${
      (segment.left + margin).toFixed(2)
    }" width="${
      (segment.right - segment.left - 2 * margin).toFixed(2)
    }" rx="1" />`);// }"

    this.usedClipPathId = ++MediaProgressLine.svgClipPathIdSeed;

    const svgId = `media-progress-line-clip-path-svg-${MediaProgressLine.svgClipPathIdSeed}`;
    const clipPathId = `media-progress-line-clip-path-${MediaProgressLine.svgClipPathIdSeed}`;

    this.removeClipPathFromDOM();

    this.clipPathSvg = createElementFromMarkup(`
      <svg width="0" height="0" class="media-progress-line-clip-path-svg" id="${svgId}">
        <clipPath id="${clipPathId}">
          ${rects.join('\n')}
        </clipPath>
      </svg>
    `);

    document.body.append(this.clipPathSvg);

    this.filledContainer.style.clipPath = `url(#${clipPathId})`;
  }

  protected getTimestampSegments(totalWidth: number) {
    const {videoTimestamps} = this.options;
    if(!videoTimestamps?.length || !this.filledContainer) return [];

    const duration = this.media.duration;

    if(!duration) return [];

    const timePoints = videoTimestamps.map(({time}) => time)
    .filter((time) => time >= 0 && time <= duration)
    .sort((a, b) => a - b);

    if(timePoints[0] !== 0) timePoints.unshift(0);
    timePoints.push(duration);

    const result: VideoTimestampSegment[] = [];

    let prevRight = 0;
    for(let i = 0; i < timePoints.length - 1; i++) {
      const left = Math.max(prevRight, timePoints[i] / duration * totalWidth);
      let right = timePoints[i + 1] / duration * totalWidth;

      if(right <= left) continue;

      right = Math.max(right, left + MIN_VIDEO_TIMESTAMP_SEGMENT_WIDTH);
      prevRight = right;

      if(right + MIN_VIDEO_TIMESTAMP_SEGMENT_WIDTH >= totalWidth) right = totalWidth;

      result.push({
        left,
        right,
        time: timePoints[i]
      });

      if(right === totalWidth) break;
    }

    return result;
  }

  public removeClipPathFromDOM() {
    this.clipPathSvg?.remove();
  }

  protected onLoadedData = () => {
    this.setSeekMax();
    this.setTimestampsClipPath();
  };

  protected onEnded = () => {
    this.setProgress();
  };

  protected onPlay = () => {
    const r = () => {
      this.setProgress();

      this.progressRAF = this.media.paused ? undefined : window.requestAnimationFrame(r);
    };

    if(this.progressRAF) {
      window.cancelAnimationFrame(this.progressRAF);
      this.progressRAF = undefined;
    }

    if(this.streamable) {
      this.setLoadProgress();
    }

    // this.lastOnPlayTime = Date.now();
    // this.lastOnPlayCurrentTime = this.media.currentTime;
    r();
    // this.progressRAF = window.requestAnimationFrame(r);
  };

  protected onTimeUpdate = () => {
    if(this.media.paused) {
      this.setProgress();

      if(this.streamable) {
        this.setLoadProgress();
      }
    }
  };

  protected onProgress = (e: Event) => {
    this.setLoadProgress();
  };

  protected scrub(e: GrabEvent) {
    const scrubTime = super.scrub(e, this.snapScrubValue);
    setCurrentTime(this.media, scrubTime);
    return scrubTime;
  }

  protected snapScrubValue = (value: number) => {
    if(!this.segments?.length) return value;

    const totalWidth = this.segments[this.segments.length - 1].right;
    const x = value / this.media.duration * totalWidth;
    for(const segment of this.segments) {
      if(segment.left - 2 <= x && x <= segment.left + 3) return segment.time;
    }

    return value;
  }

  protected setLoadProgress() {
    if(appMediaPlaybackController.isSafariBuffering(this.media)) return;
    const buf = this.media.buffered;
    const numRanges = buf.length;

    const currentTime = this.media.currentTime;
    let nearestStart = 0, end = 0;
    for(let i = 0; i < numRanges; ++i) {
      const start = buf.start(i);
      if(currentTime >= start && start >= nearestStart) {
        nearestStart = start;
        end = buf.end(i);
      }

      // console.log('onProgress range:', i, buf.start(i), buf.end(i), this.media);
    }

    // console.log('onProgress correct range:', nearestStart, end, this.media);

    const percents = this.max ? end / this.max : 0;
    this.filledLoad.style.width = (percents * 100) + '%';
    // this.filledLoad.style.transform = 'scaleX(' + percents + ')';
  }

  protected setSeekMax(duration?: number) {
    const realDuration = this.media.duration || 0;
    if(duration === undefined || realDuration) duration = realDuration;
    if(this.max = duration) {
      this.seek.setAttribute('max', '' + this.max);
    } else {
      this.media.addEventListener('loadeddata', this.onLoadedData);
    }
  }

  public setProgress() {
    if(appMediaPlaybackController.isSafariBuffering(this.media)) return;

    // fix jumping progress on play
    // let currentTime: number;
    // const diff = (Date.now() - this.lastOnPlayTime) / 1000;
    // if(!this.media.paused && this.lastOnPlayTime && diff <= 1) {
    //   currentTime = this.lastOnPlayCurrentTime + diff;
    // } else {
    //   currentTime = this.media.currentTime;
    // }

    const currentTime = this.media.currentTime;
    this.options.onTimeUpdate?.(currentTime);
    super.setProgress(currentTime);

    this.container.style.setProperty('--progress', currentTime / this.media.duration + '');
  }

  public setListeners() {
    super.setListeners();
    this.media.addEventListener('ended', this.onEnded);
    this.media.addEventListener('play', this.onPlay);
    this.media.addEventListener('pause', this.onTimeUpdate);
    this.media.addEventListener('timeupdate', this.onTimeUpdate);
    this.streamable && this.media.addEventListener('progress', this.onProgress);
  }

  public removeListeners() {
    super.removeListeners();

    if(this.media) {
      this.media.removeEventListener('loadeddata', this.onLoadedData);
      this.media.removeEventListener('ended', this.onEnded);
      this.media.removeEventListener('play', this.onPlay);
      this.media.removeEventListener('pause', this.onTimeUpdate);
      this.media.removeEventListener('timeupdate', this.onTimeUpdate);
      this.streamable && this.media.removeEventListener('progress', this.onProgress);
    }

    this.container.removeEventListener('pointermove', this.onHover);
    this.container.removeEventListener('pointerout', this.onPointerOut);

    if(this.progressRAF) {
      window.cancelAnimationFrame(this.progressRAF);
      this.progressRAF = undefined;
    }
  }

  public cleanup() {
    this.removeClipPathFromDOM();
    this.removeListeners();
    this.unobserveResize?.();
    this.segments = [];
  }
}
