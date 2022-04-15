/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { GrabEvent } from "../helpers/dom/attachGrabListeners";
import appMediaPlaybackController from "./appMediaPlaybackController";
import RangeSelector from "./rangeSelector";

export default class MediaProgressLine extends RangeSelector {
  protected filledLoad: HTMLDivElement;

  protected progressRAF = 0;

  protected media: HTMLMediaElement;
  protected streamable: boolean;

  constructor(media?: HTMLAudioElement | HTMLVideoElement, streamable?: boolean, withTransition?: boolean, useTransform?: boolean) {
    super({
      step: 1000 / 60 / 1000, 
      min: 0, 
      max: 1, 
      withTransition, 
      useTransform
    }, 0);

    if(media) {
      this.setMedia(media, streamable);
    }
  }

  public setMedia(media: HTMLMediaElement, streamable = false) {
    if(this.media) {
      this.removeListeners();
    }

    if(streamable && !this.filledLoad) {
      this.filledLoad = document.createElement('div');
      this.filledLoad.classList.add('progress-line__filled', 'progress-line__loaded');
      this.container.prepend(this.filledLoad);
      //this.setLoadProgress();
    } else if(this.filledLoad) {
      this.filledLoad.classList.toggle('hide', !streamable);
    }

    this.media = media;
    this.streamable = streamable;
    if(!media.paused || media.currentTime > 0) {
      this.onPlay();
    }

    let wasPlaying = false;
    this.setSeekMax();
    this.setListeners();
    this.setHandlers({
      onMouseDown: () => {
        wasPlaying = !this.media.paused;
        wasPlaying && this.media.pause();
      },

      onMouseUp: (e) => {
        // cancelEvent(e.event);
        wasPlaying && this.media.play();
      }
    });
  }

  protected onLoadedData = () => {
    this.max = this.media.duration;
    this.seek.setAttribute('max', '' + this.max);
  };

  protected onEnded = () => {
    this.setProgress();
  };

  protected onPlay = () => {
    let r = () => {
      this.setProgress();

      this.progressRAF = this.media.paused ? 0 : window.requestAnimationFrame(r);
    };

    if(this.progressRAF) {
      window.cancelAnimationFrame(this.progressRAF);
    }

    if(this.streamable) {
      this.setLoadProgress();
    }

    this.progressRAF = window.requestAnimationFrame(r);
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
    const scrubTime = super.scrub(e);
    this.media.currentTime = scrubTime;
    return scrubTime;
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

      //console.log('onProgress range:', i, buf.start(i), buf.end(i), this.media);
    }

    //console.log('onProgress correct range:', nearestStart, end, this.media);

    const percents = this.media.duration ? end / this.media.duration : 0;
    this.filledLoad.style.width = (percents * 100) + '%';
    //this.filledLoad.style.transform = 'scaleX(' + percents + ')';
  }

  protected setSeekMax() {
    this.max = this.media.duration || 0;
    if(this.max > 0) {
      this.onLoadedData();
    } else {
      this.media.addEventListener('loadeddata', this.onLoadedData);
    }
  }

  public setProgress() {
    if(appMediaPlaybackController.isSafariBuffering(this.media)) return;
    const currentTime = this.media.currentTime;

    super.setProgress(currentTime);
  }

  public setListeners() {
    super.setListeners();
    this.media.addEventListener('ended', this.onEnded);
    this.media.addEventListener('play', this.onPlay);
    this.media.addEventListener('timeupdate', this.onTimeUpdate);
    this.streamable && this.media.addEventListener('progress', this.onProgress);
  }

  public removeListeners() {
    super.removeListeners();

    if(this.media) {
      this.media.removeEventListener('loadeddata', this.onLoadedData);
      this.media.removeEventListener('ended', this.onEnded);
      this.media.removeEventListener('play', this.onPlay);
      this.media.removeEventListener('timeupdate', this.onTimeUpdate);
      this.streamable && this.media.removeEventListener('progress', this.onProgress);
    }

    if(this.progressRAF) {
      window.cancelAnimationFrame(this.progressRAF);
      this.progressRAF = 0;
    }
  }
}
