/*
*  Copyright (c) 2018-present, Evgeny Nadymov
*
* This source code is licensed under the GPL v.3.0 license found in the
* LICENSE file in the root directory of this source tree.
*/

// @ts-ignore
import MP4Box from 'mp4box/dist/mp4box.all.min';
import { logger, LogLevels } from './polyfill';

export default class MP4Source {
  private mp4file: any;
  private nextBufferStart = 0;
  private mediaSource: MediaSource = null;
  private ready = false;
  private bufferedTime = 40;

  private beforeMoovBufferSize = 32 * 1024;
  private moovBufferSize = 512 * 1024;
  private bufferSize = 512 * 1024;
  private seekBufferSize = 256 * 1024;

  private currentBufferSize = this.beforeMoovBufferSize;
  private nbSamples = 10;
  private expectedSize: number;

  private seeking = false;
  private loading = false;
  private url: string;

  private log = logger('MP4'/* , LogLevels.error */);

  //public onLoadBuffer: (offset: number)

  constructor(private video: {duration: number, video: {expected_size: number}}, private getBufferAsync: (start: number, end: number) => Promise<ArrayBuffer>) {
    this.expectedSize = this.video.video.expected_size;

    this.init(video.duration);
  }
  
  init(videoDuration: number) {
    const mediaSource = new MediaSource();
    mediaSource.addEventListener('sourceopen', () => {
      this.log('[MediaSource] sourceopen start', this.mediaSource, this);
      
      if(this.mediaSource.sourceBuffers.length > 0) return;
      
      const mp4File = MP4Box.createFile();
      mp4File.onMoovStart = () => {
        this.log('[MP4Box] onMoovStart');
        this.currentBufferSize = this.moovBufferSize;
      };

      mp4File.onError = (error: Error) => {
        this.log('[MP4Box] onError', error);
      };

      mp4File.onReady = (info: any) => {
        this.log('[MP4Box] onReady', info);
        this.ready = true;
        this.currentBufferSize = this.bufferSize;
        const { isFragmented, timescale, fragment_duration, duration } = info;
        
        if(!fragment_duration && !duration) {
          this.mediaSource.duration = videoDuration;
          this.bufferedTime = videoDuration;
        } else {
          this.mediaSource.duration = isFragmented
          ? fragment_duration / timescale
          : duration / timescale;
        }
        
        this.initializeAllSourceBuffers(info);
      };

      mp4File.onSegment = (id: number, sb: any, buffer: ArrayBuffer, sampleNum: number, is_last: boolean) => {
        const isLast = (sampleNum + this.nbSamples) > sb.nb_samples;
        
        this.log('[MP4Box] onSegment', id, buffer, `${sampleNum}/${sb.nb_samples}`, isLast, sb.timestampOffset, mediaSource, is_last);

        sb.segmentIndex++;
        sb.pendingAppends.push({ id, buffer, sampleNum, is_last: isLast });

        this.onUpdateEnd(sb, true, false);
      };
      
      this.mp4file = mp4File;
      this.log('[MediaSource] sourceopen end', this, this.mp4file);
      
      this.loadNextBuffer();
    });

    mediaSource.addEventListener('sourceended', () => {
      this.log('[MediaSource] sourceended', mediaSource.readyState);
      //this.getBufferAsync = null;
    });

    mediaSource.addEventListener('sourceclose', () => {
      this.log('[MediaSource] sourceclose', mediaSource.readyState);
      //this.getBufferAsync = null;
    });
    
    this.mediaSource = mediaSource;
  }

  private onInitAppended(sb: any) {
    sb.sampleNum = 0;
    sb.addEventListener('updateend', () => this.onUpdateEnd(sb, true, true));
    /* In case there are already pending buffers we call onUpdateEnd to start appending them*/
    this.onUpdateEnd(sb, false, true);

    // @ts-ignore
    this.mediaSource.pendingInits--;
    // @ts-ignore
    if(this.mediaSource.pendingInits === 0) {
      this.log('onInitAppended start!');
      this.mp4file.start();

      if(this.expectedSize > this.bufferSize) {
        this.nextBufferStart = this.bufferSize;
      } else {
        return;
      }

      /* setInterval(() => {
        this.loadNextBuffer();
      }, 1e3); */
      this.loadNextBuffer();
    }
  };

  private onUpdateEnd(sb: any, isNotInit: boolean, isEndOfAppend: boolean) {
    //console.this.log('onUpdateEnd', sb, isNotInit, isEndOfAppend, sb.sampleNum, sb.is_last);
    if(isEndOfAppend === true) {
      if(sb.sampleNum) {
        this.mp4file.releaseUsedSamples(sb.id, sb.sampleNum);
        delete sb.sampleNum;
      }

      if(sb.is_last) {
        this.log('onUpdateEnd', sb, isNotInit, isEndOfAppend, sb.sampleNum, sb.is_last);
        this.mediaSource.endOfStream();
      }
    }

    if(this.mediaSource.readyState === "open" && sb.updating === false && sb.pendingAppends.length > 0) {
      const obj = sb.pendingAppends.shift();
      this.log("MSE - SourceBuffer #"+sb.id, "Appending new buffer, pending: "+sb.pendingAppends.length);
      sb.sampleNum = obj.sampleNum;
      sb.is_last = obj.is_last;
      sb.appendBuffer(obj.buffer);
    }
  }

  private initializeAllSourceBuffers(info: any) {
    for(let i = 0; i < info.tracks.length; i++) {
      this.addSourceBuffer(info.tracks[i]);
    }

    this.initializeSourceBuffers();
  }

  private initializeSourceBuffers() {
    const initSegs = this.mp4file.initializeSegmentation();
    this.log('[MP4Box] initializeSegmentation', initSegs);
    
    for(let i = 0; i < initSegs.length; i++) {
      const sb: any = initSegs[i].user;
      if(i === 0) {
        // @ts-ignore
        this.mediaSource.pendingInits = 0;
      }

      let onInitAppended = () => {
        if(this.mediaSource.readyState === "open") {
          sb.removeEventListener('updateend', onInitAppended);
          this.onInitAppended(sb);
        }
      };
      
      sb.addEventListener('updateend', onInitAppended);
      sb.appendBuffer(initSegs[i].buffer);
      sb.segmentIndex = 0;

      // @ts-ignore
      this.mediaSource.pendingInits++;
    }
  }
  
  private addSourceBuffer(track: {id: number, codec: string, type: 'video', nb_samples: number}) {
    const file = this.mp4file;
    const ms = this.mediaSource;
    if(!track) return;
    
    const { id, codec, type: trackType, nb_samples } = track;
    const mime = `video/mp4; codecs="${codec}"`;
    this.log('mimetype:', mime);
    if(!MediaSource.isTypeSupported(mime)) {
      this.log('[addSourceBuffer] not supported', mime);
      return;
    }

    const sb: any = ms.addSourceBuffer(mime);
    sb.id = id;
    sb.pendingAppends = [];
    sb.nb_samples = nb_samples;
    file.setSegmentOptions(id, sb, { nbSamples: this.nbSamples });

    this.log('[addSourceBuffer] add', id, codec, trackType, sb);
    sb.addEventListener("error", (e: Event) => {
      this.log("MSE SourceBuffer #" + id, e);
    });
  }

  stop() {
    this.mp4file.stop();
    this.mp4file = null;
    this.getBufferAsync = null;
  }

  getURL() {
    return this.url ?? (this.url = URL.createObjectURL(this.mediaSource));
  }
  
  seek(currentTime: number/* , buffered: any */) {
    const seekInfo: {offset: number, time: number} = this.mp4file.seek(currentTime, true);
    this.nextBufferStart = seekInfo.offset;
    
    const loadNextBuffer = true;
    /* let loadNextBuffer = buffered.length === 0;
    for(let i = 0; i < buffered.length; i++) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      
      if(start <= currentTime && currentTime + this.bufferedTime > end) {
        loadNextBuffer = true;
        break;
      }
    } */
    
    this.log('[player] onSeeked', loadNextBuffer, currentTime, seekInfo, this.nextBufferStart);
    if(loadNextBuffer) {
      this.loadNextBuffer(true);
    }

    return seekInfo.offset;
  }
  
  timeUpdate(currentTime: number, duration: number, buffered: any) {
    //return;

    const ranges = [];
    for(let i = 0; i < buffered.length; i++) {
      ranges.push({ start: buffered.start(i), end: buffered.end(i)})
    }
    
    let loadNextBuffer = buffered.length === 0;
    let hasRange = false;
    for(let i = 0; i < buffered.length; i++) {
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
    
    if(!hasRange) {
      loadNextBuffer = true;
    }
    
    this.log('[player] timeUpdate', loadNextBuffer, currentTime, duration, JSON.stringify(ranges));
    if(loadNextBuffer) {
      this.loadNextBuffer();
    }
  }
  
  async loadNextBuffer(seek = false) {
    const { nextBufferStart, loading, currentBufferSize, mp4file } = this;
    this.log('[player] loadNextBuffer', nextBufferStart === undefined, loading, !mp4file);
    if(!mp4file) return;
    if(nextBufferStart === undefined) return;
    if(loading) return;

    //return;
    
    this.loading = true;
    let bufferSize = seek ? this.seekBufferSize : this.bufferSize;
    if(nextBufferStart + bufferSize > this.expectedSize) {
      bufferSize = this.expectedSize - nextBufferStart;
    }
    const nextBuffer = await this.getBufferAsync(nextBufferStart, nextBufferStart + bufferSize);
    // @ts-ignore
    nextBuffer.fileStart = nextBufferStart;

    const end = (nextBuffer.byteLength !== bufferSize)/*  || (nextBuffer.byteLength === this.expectedSize) */;
    
    this.log('[player] loadNextBuffer start', nextBuffer.byteLength, nextBufferStart, end);
    if(nextBuffer.byteLength) {
      this.nextBufferStart = mp4file.appendBuffer(nextBuffer/* , end */);
    } else {
      this.nextBufferStart = undefined;
    }

    if(end) {
      this.log('[player] loadNextBuffer flush');
      this.mp4file.flush();
    }

    this.log('[player] loadNextBuffer stop', nextBuffer.byteLength, nextBufferStart, this.nextBufferStart);
    
    this.loading = false;
    if(!this.ready || !end) {
      this.log('[player] loadNextBuffer next');
      this.loadNextBuffer();
    }
  }
}