/*
*  Copyright (c) 2018-present, Evgeny Nadymov
*
* This source code is licensed under the GPL v.3.0 license found in the
* LICENSE file in the root directory of this source tree.
*/

import MP4Box from 'mp4box/dist/mp4box.all.min';
//import { LOG, logSourceBufferRanges } from '../Utils/Common';

let LOG = () => console.log(...arguments);

export default class MP4Source {
  constructor(video, getBufferAsync) {
    this.mp4file = null;
    this.nextBufferStart = 0;
    this.mediaSource = null;
    this.ready = false;
    this.bufferedTime = 40;
    
    this.beforeMoovBufferSize = 32 * 1024;
    this.moovBufferSize = 512 * 1024;
    this.bufferSize = 1024 * 1024;
    this.seekBufferSize = 1024 * 1024;
    
    this.currentBufferSize = this.beforeMoovBufferSize;
    this.nbSamples = 10;
    this.video = video;
    this.getBufferAsync = getBufferAsync;
    this.expectedSize = this.video.video.expected_size;
    
    this.seeking = false;
    this.loading = false;
    this.url = null;
    
    this.init(video.duration);
  }
  
  init(videoDuration) {
    const mediaSource = new MediaSource();
    mediaSource.addEventListener('sourceopen', async () => {
      LOG('[MediaSource] sourceopen start', this.mediaSource, this);
      
      if (this.mediaSource.sourceBuffers.length > 0) return;
      
      const mp4File = MP4Box.createFile();
      mp4File.onMoovStart = () => {
        LOG('[MP4Box] onMoovStart');
        this.currentBufferSize = this.moovBufferSize;
      };
      mp4File.onError = error => {
        LOG('[MP4Box] onError', error);
      };
      mp4File.onReady = info => {
        LOG('[MP4Box] onReady', info);
        this.ready = true;
        this.currentBufferSize = this.bufferSize;
        const { isFragmented, timescale, fragment_duration, duration } = info;
        
        if (!fragment_duration && !duration) {
          this.mediaSource.duration = videoDuration;
          this.bufferedTime = videoDuration;
        } else {
          this.mediaSource.duration = isFragmented
          ? fragment_duration / timescale
          : duration / timescale;
        }
        
        for (let i = 0; i < info.tracks.length; i++) {
          this.addSourceBuffer(mp4File, this.mediaSource, info.tracks[i]);
        }
        
        const initSegs = mp4File.initializeSegmentation();
        LOG('[MP4Box] initializeSegmentation', initSegs);
        
        for (let i = 0; i < initSegs.length; i++) {
          const { user: sourceBuffer } = initSegs[i];
          sourceBuffer.onupdateend = () => {
            sourceBuffer.initSegs = true;
            sourceBuffer.onupdateend = this.handleSourceBufferUpdateEnd;
          };
          sourceBuffer.appendBuffer(initSegs[i].buffer);
        }
        
        LOG('[MP4Box] start fragmentation');
        mp4File.start();
      };
      mp4File.onSegment = (id, sourceBuffer, buffer, sampleNum, is_last) => {
        const isLast = (sampleNum + this.nbSamples) > sourceBuffer.nb_samples;
        
        LOG('[MP4Box] onSegment', id, buffer, `${sampleNum}/${sourceBuffer.nb_samples}`, isLast, sourceBuffer.timestampOffset);
        
        if (mediaSource.readyState !== 'open') {
          return;
        }
        
        sourceBuffer.pendingUpdates.push({ id, buffer, sampleNum, isLast });
        if (sourceBuffer.initSegs && !sourceBuffer.updating) {
          this.handleSourceBufferUpdateEnd({ target: sourceBuffer, mediaSource: this.mediaSource });
        }
      };
      
      this.nextBufferStart = 0;
      this.mp4file = mp4File;
      LOG('[MediaSource] sourceopen end', this, this.mp4file);
      
      this.loadNextBuffer();
    });
    mediaSource.addEventListener('sourceended', () => {
      LOG('[MediaSource] sourceended', mediaSource.readyState);
    });
    mediaSource.addEventListener('sourceclose', () => {
      LOG('[MediaSource] sourceclose', mediaSource.readyState);
    });
    
    this.mediaSource = mediaSource;
  }
  
  addSourceBuffer(file, source, track) {
    if (!track) return null;
    
    const { id, codec, type: trackType, nb_samples } = track;
    const type = `video/mp4; codecs="${codec}"`;
    if (!MediaSource.isTypeSupported(type)) {
      LOG('[addSourceBuffer] not supported', type);
      return null;
    }
    // if (trackType !== 'video') {
    //     LOG('[addSourceBuffer] skip', trackType);
    //     return null;
    // }
    
    const sourceBuffer = source.addSourceBuffer(type);
    sourceBuffer.id = id;
    sourceBuffer.pendingUpdates = [];
    sourceBuffer.nb_samples = nb_samples;
    file.setSegmentOptions(id, sourceBuffer, { nbSamples: this.nbSamples });
    LOG('[addSourceBuffer] add', id, codec, trackType);
    
    return sourceBuffer;
  }
  
  handleSourceBufferUpdateEnd = event => {
    const { target: sourceBuffer } = event;
    const { mediaSource, mp4file } = this;
    
    if (!sourceBuffer) return;
    if (sourceBuffer.updating) return;
    
    //logSourceBufferRanges(sourceBuffer, 0, 0);
    
    const { pendingUpdates } = sourceBuffer;
    if (!pendingUpdates) return;
    if (!pendingUpdates.length) {
      if (sourceBuffer.isLast && mediaSource.readyState === 'open') {
        LOG('[SourceBuffer] updateend endOfStream start', sourceBuffer.id);
        if (Array.from(mediaSource.sourceBuffers).every(x => !x.pendingUpdates.length && !x.updating)) {
          mediaSource.endOfStream();
          LOG('[SourceBuffer] updateend endOfStream stop', sourceBuffer.id);
        }
      }
      return;
    }
    
    const update = pendingUpdates.shift();
    if (!update) return;
    
    const { id, buffer, sampleNum, isLast } = update;
    
    if (sampleNum) {
      LOG('[SourceBuffer] updateend releaseUsedSamples', id, sampleNum);
      mp4file.releaseUsedSamples(id, sampleNum);
    }
    
    LOG('[SourceBuffer] updateend end', sourceBuffer.id, sourceBuffer.pendingUpdates.length);
    sourceBuffer.isLast = isLast;
    sourceBuffer.appendBuffer(buffer);
  };
  
  getURL() {
    this.url = this.url || URL.createObjectURL(this.mediaSource);
    
    return this.url;
  }
  
  seek(currentTime, buffered) {
    const seekInfo = this.mp4file.seek(currentTime, true);
    this.nextBufferStart = seekInfo.offset;
    
    let loadNextBuffer = buffered.length === 0;
    for (let i = 0; i < buffered.length; i++) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      
      if (start <= currentTime && currentTime + this.bufferedTime > end) {
        loadNextBuffer = true;
        break;
      }
    }
    
    LOG('[player] onSeeked', loadNextBuffer, currentTime, seekInfo, this.nextBufferStart);
    if (loadNextBuffer) {
      this.loadNextBuffer(true);
    }
  }
  
  timeUpdate(currentTime, duration, buffered) {
    const ranges = [];
    for (let i = 0; i < buffered.length; i++) {
      ranges.push({ start: buffered.start(i), end: buffered.end(i)})
    }
    
    let loadNextBuffer = buffered.length === 0;
    let hasRange = false;
    for (let i = 0; i < buffered.length; i++) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      
      if (start <= currentTime && currentTime <= end) {
        hasRange = true;
        if (end < duration && currentTime + this.bufferedTime > end) {
          loadNextBuffer = true;
          break;
        }
      }
    }
    
    if (!hasRange) {
      loadNextBuffer = true;
    }
    
    LOG('[player] timeUpdate', loadNextBuffer, currentTime, duration, JSON.stringify(ranges));
    if (loadNextBuffer) {
      this.loadNextBuffer();
    }
  }
  
  async loadNextBuffer(seek = false) {
    const { nextBufferStart, loading, currentBufferSize, mp4file } = this;
    LOG('[player] loadNextBuffer', nextBufferStart === undefined, loading, !mp4file);
    if (!mp4file) return;
    if (nextBufferStart === undefined) return;
    if (loading) return;
    
    this.loading = true;
    let bufferSize = seek ? this.seekBufferSize : this.bufferSize;
    if (nextBufferStart + bufferSize > this.expectedSize) {
      bufferSize = this.expectedSize - nextBufferStart;
    }
    const nextBuffer = await this.getBufferAsync(nextBufferStart, nextBufferStart + bufferSize);
    nextBuffer.fileStart = nextBufferStart;
    
    LOG('[player] loadNextBuffer start', nextBuffer.byteLength, nextBufferStart);
    if (nextBuffer.byteLength) {
      this.nextBufferStart = mp4file.appendBuffer(nextBuffer);
    } else {
      this.nextBufferStart = undefined;
    }
    LOG('[player] loadNextBuffer stop', nextBuffer.byteLength, nextBufferStart, this.nextBufferStart);
    
    if (nextBuffer.byteLength < currentBufferSize) {
      LOG('[player] loadNextBuffer flush');
      this.mp4file.flush();
    }
    
    this.loading = false;
    if (!this.ready) {
      LOG('[player] loadNextBuffer next');
      this.loadNextBuffer();
    }
  }
}