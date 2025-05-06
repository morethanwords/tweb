import type {OpusDecodedAudio} from '../../vendor/opus';
import type {GroupCallRtmpState} from '../appManagers/appGroupCallsManager';
import type {VideoStreamInfo} from '../calls/videoStreamInfo';
import {InputGroupCall} from '../../layer';
import {DcId} from '../../types';
import {RTMP_UNIFIED_CHANNEL_ID, RTMP_UNIFIED_QUALITY} from '../calls/constants';
import {Fmp4InitChunkInfo, generateFmp4Init, generateFmp4Segment} from '../rtmp/fmp4';
import ISOBoxer from '../rtmp/isoboxer';
import {serviceMessagePort, log, invokeVoidAll} from './index.service';
import bigInt from 'big-integer';
import {IS_SAFARI} from '../../environment/userAgent';
import {OpusDecoder} from '../../vendor/opus';
import deferredPromise from '../../helpers/cancellablePromise';
import {logger} from '../logger';
import assumeType from '../../helpers/assumeType';
import clamp from '../../helpers/number/clamp';
import pause from '../../helpers/schedulers/pause';
import {ActiveAccountNumber} from '../accounts/types';
import {getCurrentAccountFromURL} from '../accounts/getCurrentAccountFromURL';

const ctx = self as any as ServiceWorkerGlobalScope;

const pendingStreams: Map<string, RtmpStream> = new Map();
(ctx as any).pendingStreams = pendingStreams;
// сафари прекрасный браузер - перезагружает плейлист даже после ENDLIST
// костыль чтобы не было проблем с перезагрузкой мертвого стрима
const lastKnownTime = new Map<Long, bigInt.BigInteger>();
const floodRelease = new Map<Long, number>();

const BUFFER_MS_MIN = 8000;
const BUFFER_MS_MAX = 10000;
const BUFFER_MS_START = 5000;
const OFFSET_MS = 1000;

// seconds to consider stream to be still alive when using hls
// (since the last time manifest was requested)
const HLS_TIMEOUT = 30000;
// seconds to consider stream to be still alive when using fmp4 streaming
// (since the last controller has died)
const STREAM_TIMEOUT = 5000;

const MP4_MIME = 'video/mp4';
const HLS_MIME = 'application/vnd.apple.mpegurl';

function scaleToTime(scale: number) {
  if(scale < 0) return 1000 << -scale;
  return 1000 >> scale;
}

interface BufferedChunk {
  time: bigInt.BigInteger;
  seq?: number;
  iso?: any;
  segment?: Uint8Array;
}
type HlsWaiter = (chunk?: Uint8Array) => void;

class RtmpStream {
  private _generation = 0;
  private _retryCount = 0;
  private _destroyed = false;

  private _controllers = new Set<ReadableStreamDefaultController<Uint8Array>>();
  private _waitingForBuffer = new Set<ReadableStreamDefaultController<Uint8Array>>();

  private _deadTimeout?: number;
  private _timeouts = new Set<number>();

  private _hlsWaitingForBuffer: HlsWaiter[] = [];
  private _hlsWaitingForChunk = new Map<number, HlsWaiter[]>();
  private _pendingRejects: ((error: any) => void)[] = [];

  private _opusDecoder?: OpusDecoder;

  private _time: bigInt.BigInteger;
  private _cutoff: bigInt.BigInteger;
  private _lastFlushedTime: bigInt.BigInteger;
  private _lastRequestedTime: bigInt.BigInteger;

  private _scale: number;
  private _chunkTime: number;
  private _buffer: BufferedChunk[];
  private _bufferSize: number;
  private _dcId: DcId;

  private _clock: number;

  private _initChunk?: Fmp4InitChunkInfo;
  private _lastChunkSeq: number;

  private _replenishTempId: number;
  private _lastReplenishingPromise: Promise<void>;

  private _rtts: number[];

  private _decoderInitPromise?: Promise<void>;

  private _log: ReturnType<typeof logger>;

  constructor(readonly call: InputGroupCall, readonly accountNumber: ActiveAccountNumber) {
    this.decodeOpus = this.decodeOpus.bind(this);
    this._log = logger('RTMP-' + (Date.now() + '').slice(-2));
    this._log('constructor', call.id);
  }

  private updateRtt(rtt: number) {
    if(this._rtts.push(rtt) > 10) {
      this._rtts.shift();
    }
  }

  private maybeAdjustBufferSize() {
    if(this._rtts.length < 3) return;

    const log = this._log.bindPrefix('maybeAdjustBufferSize');

    const avgRtt = this._rtts.reduce((a, b) => a + b, 0) / this._rtts.length;
    const targetBufferSize = Math.ceil(clamp(avgRtt * 3, BUFFER_MS_MIN, BUFFER_MS_MAX) / this._chunkTime);

    log(`avg rtt=${avgRtt} target buffer size=${targetBufferSize}`);

    if(targetBufferSize !== this._bufferSize) {
      const diff = targetBufferSize - this._bufferSize;
      this._cutoff = this._cutoff.minus(this._chunkTime * diff);
      this._bufferSize = targetBufferSize;
      log(`adjusted buffer size to ${targetBufferSize}`);
    }
  }

  private async processChunk(iso: any, seq: number) {
    if(!iso) return new Uint8Array(0);
    return generateFmp4Segment({
      chunk: iso,
      seq: seq,
      timestamp: bigInt(seq).multiply(this._chunkTime),
      opusTrackId: this._initChunk.opusTrackId,
      decodeOpus: IS_SAFARI && this.decodeOpus
    });
  }

  private async fetchChunk(time: bigInt.BigInteger, ignoreRequestedTime?: boolean) {
    const log = this._log.bindPrefix('fetchChunk-' + time.toString());
    if(time.isNegative()) {
      // chunk does not exist (e.g. stream has just started)
      log.warn('negative time');
      return;
    }
    if(!ignoreRequestedTime && this._lastRequestedTime !== undefined && time.lesserOrEquals(this._lastRequestedTime)) {
      // this chunk was already fetched, likely due to resync
      log.warn('last requested time is greater or equals', this._lastRequestedTime.toString());
      return;
    }

    this._lastRequestedTime = time;
    log(`starting fetch time=${time}`);
    const now = Date.now();
    const info = await serviceMessagePort.invoke('requestRtmpPart', {
      dcId: this._dcId,
      accountNumber: this.accountNumber,
      request: {
        _: 'inputGroupCallStream',
        call: this.call,
        time_ms: time.toString(),
        scale: this._scale,
        video_channel: RTMP_UNIFIED_CHANNEL_ID,
        video_quality: RTMP_UNIFIED_QUALITY
      }
    }) as VideoStreamInfo;
    const rtt = Date.now() - now;
    this.updateRtt(rtt);
    log(`ended fetch time=${time}, rtt=${rtt}`);

    // empty chunk (e.g. stream has just started)
    if(!info) {
      log.warn('no bytes');
      return;
    }

    if(info.container !== 'mp4') {
      throw new Error('Invalid container');
    }

    const iso = ISOBoxer.parseBuffer(info.bytes.slice(info.contentOffset).buffer);
    return iso;
  }

  private async generateInitChunk(iso: any) {
    if(this._initChunk) {
      return;
    }

    this._initChunk = generateFmp4Init(iso, {
      opusToFlac: IS_SAFARI
    });
    if(this._initChunk.opusInitOptions) {
      await this.initOpusDecoder();
    }
    this._retryCount = 0;
  }

  private async initOpusDecoder(ignoreExisting = false) {
    if(this._decoderInitPromise) {
      await this._decoderInitPromise;
      return;
    }

    this._log('creating opus decoder');
    if(this._opusDecoder !== undefined && !ignoreExisting) {
      this._opusDecoder.free();
    }
    const decoder = new OpusDecoder(this._initChunk.opusInitOptions);
    this._decoderInitPromise = decoder.ready;
    await this._decoderInitPromise;
    this._opusDecoder = decoder;
    this._log('opus decoder created');
  }

  private async decodeOpus(chunk: Uint8Array): Promise<OpusDecodedAudio> {
    if(this._opusDecoder === undefined) {
      await this.initOpusDecoder();
    }

    return this._opusDecoder.decodeFrame(chunk);
  }

  private hasEnoughBuffer() {
    return !!this._initChunk && this._bufferSize && this._buffer.some((chunk) => !!chunk.segment);
  }

  private sendBufferToController(controller: ReadableStreamDefaultController<Uint8Array>) {
    this._log('sending buffer to controller');
    controller.enqueue(this._initChunk.data);
    for(const chunk of this._buffer) {
      if(!chunk.segment) break;
      controller.enqueue(chunk.segment);
    }
  }

  private removeStaleChunks() {
    do {
      const chunk = this._buffer[0];
      if(chunk && chunk.time.lt(this._cutoff)) {
        this._buffer.shift();
        this._log('removing stale chunk', chunk.time.toString());
      } else {
        break;
      }
    } while(true);
  }

  private async _replenishBuffer(maxChunks: number = 1, lastReplenishingPromise = this._lastReplenishingPromise): Promise<void> {
    const log = this._log.bindPrefix('replenishBuffer-' + this._replenishTempId++);
    this.removeStaleChunks();

    const thisGeneration = this._generation;

    // fetch upcoming chunks
    const chunksToFetch = clamp(this._bufferSize - this._buffer.length, 0, maxChunks);
    if(!chunksToFetch) {
      log('skipping replenish - buffer full');
      return;
    }

    const shouldSkip = () => this._destroyed || this._generation !== thisGeneration;
    const lastBufferedChunkTime = this._lastRequestedTime;
    const tasks: Promise<BufferedChunk>[] = [];

    log(`replenishing buffer chunksToFetch=${chunksToFetch} lastBufferedChunkTime=${lastBufferedChunkTime} bufferLength=${this._buffer.length}`);

    for(let i = 1; i <= chunksToFetch; ++i) {
      const nextTime = lastBufferedChunkTime.add(this._chunkTime * i);
      const chunk: BufferedChunk = {time: nextTime};
      this._buffer.push(chunk);

      const fetchChunk = async(ignoreRequestedTime?: boolean): Promise<BufferedChunk> => {
        try {
          chunk.iso = await this.fetchChunk(nextTime, ignoreRequestedTime);
        } catch(e) {
          assumeType<ApiError>(e);
          log('error', e.type, nextTime.toString());

          const retry = async(delay: number) => {
            await pause(delay);
            if(shouldSkip()) return;
            return fetchChunk(true);
          };

          if(e.type === 'TIME_TOO_BIG') { // * can happen when we're ahead or the stream is ended
            if(ignoreRequestedTime) { // * we already tried to refetch it
              throw new Error('stream ended');
            }

            const state = await this.fetchState();
            if(shouldSkip()) return;
            const channel = this.findChannel(state); // * will throw an error if channel not found
            const delay = nextTime.minus(bigInt(channel.last_timestamp_ms as number)).add(this._chunkTime).toJSNumber();
            if(delay < 0) {
              throw new Error('stream ended');
            }

            return retry(delay);
          }/*  else if(e.type.startsWith('FLOOD_WAIT_')) {
            const wait = +e.type.split('_').pop();
            if(wait > 10) {
              throw e;
            }

            return retry(wait * 1000);
          } */ else {
            throw e;
          }
        }
        return chunk;
      };

      tasks.push(fetchChunk());
    }

    let newChunks = await Promise.all(tasks);

    if(shouldSkip()) return; // resync happened while we were fetching

    this.maybeAdjustBufferSize();

    // * wait for previous requests to flush if got new chunk faster
    await lastReplenishingPromise;
    if(shouldSkip()) return;

    // remove any chunks that are now too old
    newChunks = newChunks.filter((chunk) => chunk.time.gt(this._lastFlushedTime));
    if(!newChunks.length) {
      log.warn('skipping flush - no new chunks');
      return;
    }

    if(this._lastFlushedTime.notEquals(bigInt.zero) &&
      newChunks[0].time.minus(this._lastFlushedTime).notEquals(this._chunkTime)) {
      log.error(`chunks are not continuous, lastFlushed=${this._lastFlushedTime.toString()}, newChunks=${newChunks[0].time.toString()}`);
    }

    this._lastFlushedTime = newChunks[newChunks.length - 1].time;

    newChunks = newChunks.filter((chunk) => {
      if(!chunk.iso) {
        this._log.error('empty chunk?', chunk);
        return false;
      }

      return true;
    });

    if(IS_SAFARI) {
      // notify pending manifests
      for(const waiter of this._hlsWaitingForBuffer) {
        waiter();
      }
      this._hlsWaitingForBuffer.length = 0;

      // notify pending chunks
      for(const chunk of newChunks) {
        await this.prepareChunkForFlushing(chunk);

        const waiters = this._hlsWaitingForChunk.get(chunk.seq) || [];
        this._hlsWaitingForChunk.delete(chunk.seq);
        log(`sending chunk to waiters time=${chunk.time} seq=${chunk.seq}`);

        for(const waiter of waiters) {
          waiter(chunk.segment);
        }
      }
    } else {
      // notify active controllers

      for(const chunk of newChunks) {
        await this.prepareChunkForFlushing(chunk);

        log(`sending chunk to controller time=${chunk.time} seq=${chunk.seq}`);

        for(const controller of this._controllers) {
          controller.enqueue(chunk.segment);
        }
      }

      // notify new controllers and move them from waiting to active
      for(const controller of this._waitingForBuffer) {
        this.sendBufferToController(controller);
        this._controllers.add(controller);
      }
      this._waitingForBuffer.clear();
    }

    log('buffer replenished');
  }

  private replenishBuffer(...args: Parameters<RtmpStream['_replenishBuffer']>): Promise<void> {
    const lastReplenishingPromise = this._lastReplenishingPromise;
    const promise = this._lastReplenishingPromise = (async() => {
      const originalPromise = this._replenishBuffer(...args);
      try {
        const result = await originalPromise;
        await lastReplenishingPromise;
        return result;
      } catch(err) {
        throw err;
      }
    })();

    if((this._bufferSize - this._buffer.length) > 0 && this._lastRequestedTime.geq(bigInt.zero)) {
      return Promise.all([promise, this.replenishBuffer()]).then(() => {});
    }

    return promise;
  }

  private async prepareChunkForFlushing(chunk: BufferedChunk) {
    if(!this._initChunk) {
      this._log(`will add init chunk to time=${chunk.time.toString()}`);
      await this.generateInitChunk(chunk.iso);
    }

    const seq = this._lastChunkSeq++;
    chunk.seq = seq;
    chunk.segment = await this.processChunk(chunk.iso, seq);
  }

  private async fetchState() {
    const promise = deferredPromise<GroupCallRtmpState>()
    let retries = 0;
    let timeout: number;

    const retry = () => {
      if(retries > 3) {
        promise.reject(new Error('Failed to fetch state'));
        return;
      }

      if(timeout) {
        clearTimeout(timeout);
        this._timeouts.delete(timeout);
      }

      timeout = ctx.setTimeout(() => {
        retries++;
        retry();
      }, 1000);
      this._timeouts.add(timeout);

      serviceMessagePort.invoke('requestRtmpState', {
        call: this.call,
        accountNumber: this.accountNumber
      }).then((state) => {
        clearTimeout(timeout);
        promise.resolve(state);
      }).catch((e) => {
        this._log.error('error fetching state', e);
        retries++;
        retry();
      });
    }

    retry();

    return promise;
  }

  private clearClock() {
    clearInterval(this._clock);
    this._clock = undefined;
  }

  private setClock() {
    const log = this._log.bindPrefix('clock');
    const clock = this._clock = ctx.setInterval(() => {
      this._time = this._time.add(this._chunkTime);
      this._cutoff = this._cutoff.add(this._chunkTime);
      this.notifyTime();

      log(`tick ts=${this._time.toString()} cutoff=${this._cutoff.toString()}`);

      this.replenishBuffer().catch((e) => {
        if(this._destroyed || this._clock !== clock) return;

        log.error('error replenishing buffer', e);

        // if there's still some buffer, we can ignore this error and keep going
        if(!this._buffer.some((it) => it.segment)) {
          this.handleError(e);
        }
      });
    }, this._chunkTime);
  }

  private findChannel(state: GroupCallRtmpState) {
    const channel = state.channels.find((channel) => channel.channel === RTMP_UNIFIED_CHANNEL_ID);
    if(!channel) {
      log.error('no unified channel found', state);
      throw new Error('No unified channel found');
    }

    return channel;
  }

  private async _start(): Promise<void> {
    const log = this._log.bindPrefix('start');
    log(`starting ${this.call.id} generation ${this._generation} -> ${this._generation + 1}`, this);
    this.clearClock();
    this._initChunk = undefined;
    this._lastChunkSeq = 0;
    this._buffer = [];
    this._lastFlushedTime = bigInt.zero;
    // this._lastRequestedTime = undefined;
    this._replenishTempId = 0;
    this._lastReplenishingPromise = Promise.resolve();
    this._rtts = [];
    const generation = ++this._generation;
    const check = () => this._generation === generation && !this._destroyed;

    const [state] = await Promise.all([
      this.fetchState(),
      floodRelease.get(this.call.id) && pause(Math.max(0, floodRelease.get(this.call.id) - Date.now()))
    ]);
    if(!check()) return;

    floodRelease.delete(this.call.id);

    // state.channels = [{
    //   '_': 'groupCallStreamChannel',
    //   'channel': 0,
    //   'scale': 0,
    //   'last_timestamp_ms': 0
    // }];

    const channel = this.findChannel(state);

    log(`started, last_ts=${channel.last_timestamp_ms}, scale=${channel.scale}`);
    this._time = bigInt(channel.last_timestamp_ms as number).minus(OFFSET_MS);
    this._lastRequestedTime = this._time;
    if(IS_SAFARI) {
      const lastKnown = lastKnownTime.get(this.call.id);
      if(lastKnown && lastKnown.gt(this._time)) {
        this._time = lastKnown;
      }
    }

    this._cutoff = this._time.minus(BUFFER_MS_MIN);
    // this._lastRequestedTime = this._cutoff;
    this._scale = channel.scale;
    this._chunkTime = scaleToTime(this._scale);
    this._bufferSize = Math.ceil(BUFFER_MS_MIN / this._chunkTime);
    this._dcId = state.dcId;

    this.notifyTime();

    this.setClock();

    await this.replenishBuffer(Math.ceil(BUFFER_MS_START / this._chunkTime));
  }

  private start() {
    this._start().catch((e: unknown) => this.handleError(e));
  }

  private notifyTime() {
    if(IS_SAFARI) {
      lastKnownTime.set(this.call.id, this._time);
    }

    invokeVoidAll('rtmpStreamTime', {
      callId: this.call.id,
      time: this._time.toString()
    });
  }

  /**
   * @returns whether the request should be retried
   */
  private handleError(error: any): boolean {
    if(this._destroyed) return false;
    const log = this._log.bindPrefix('handleError');

    if(typeof(error) === 'object' && error && typeof(error.type) === 'string') {
      assumeType<ApiError>(error);
      if(error.type.startsWith('FLOOD_WAIT')) {
        const wait = +error.type.split('_').pop();
        floodRelease.set(this.call.id, Date.now() + wait * 1000);
        this.start();
        return true;
      }

      if(error.type === 'TIME_TOO_SMALL' || error.type === 'TIME_INVALID') {
        log('rtmp stream need resync', error);
        this.start();
        return true;
      }

      if((
        error.type === 'GROUPCALL_FORBIDDEN' ||
        error.type === 'VIDEO_CHANNEL_INVALID'
      ) && this._retryCount < 3) {
        log('retrying rtmp stream', error);
        this._retryCount += 1;
        this.start();
        return true;
      }
    }

    log('rtmp stream error', error);
    this.destroy(error);
  }

  public destroy = (error = new Error('destroyed')) => {
    this._log('destroying rtmp stream', error);
    pendingStreams.delete(this.call.id as string);
    this.clearClock();
    this.clearDeadTimeout();
    for(const timeout of this._timeouts) {
      clearTimeout(timeout);
    }
    if(this._opusDecoder !== undefined) {
      this._opusDecoder.free();
    }
    for(const controller of this._controllers) {
      controller.close();
    }
    for(const controller of this._waitingForBuffer) {
      controller.close();
    }
    for(const reject of this._pendingRejects) {
      reject(error);
    }
    this._destroyed = true;
    this._generation = 0;

    invokeVoidAll('rtmpStreamDestroyed', this.call.id);
  };

  public createStream() {
    const log = this._log.bindPrefix('createStream');
    let controller_: ReadableStreamDefaultController;
    return new ReadableStream({
      start: (controller) => {
        log(`added rtmp stream controller call=${this.call.id} gen=${this._generation} destroyed=${this._destroyed}`);
        controller_ = controller;

        if(this._generation === 0) {
          this.start();
        }

        this.clearDeadTimeout();

        if(this.hasEnoughBuffer()) {
          this.sendBufferToController(controller);
          this._controllers.add(controller);
        } else {
          this._waitingForBuffer.add(controller);
        }
      },
      cancel: () => { // * when tab with stream is closed
        if(this._destroyed) return;
        log('rtmp stream controller died', this.call.id);
        this._controllers.delete(controller_);
        this._waitingForBuffer.delete(controller_);

        if(!this._controllers.size) {
          this.setDeadTimeout(this.destroy, STREAM_TIMEOUT);
        }
      }
    });
  }

  private clearDeadTimeout() {
    if(this._deadTimeout) {
      clearTimeout(this._deadTimeout);
      this._deadTimeout = undefined;
    }
  }

  private setDeadTimeout(callback: () => void, delay: number) {
    this.clearDeadTimeout();
    this._deadTimeout = ctx.setTimeout(callback, delay);
  }

  private generateHlsPlaylist(baseUrl: string, end = false) {
    const chunkDuration = this._chunkTime / 1000;
    const playlist = [
      '#EXTM3U',
      '#EXT-X-VERSION:7',
      `#EXT-X-TARGETDURATION:${Math.ceil(chunkDuration)}`,
      `#EXT-X-MEDIA-SEQUENCE:${this._buffer[0]?.seq ?? 0}`,
      '#EXT-X-INDEPENDENT-SEGMENTS',
      `#EXT-X-MAP:URI="${baseUrl}?hls=init"`
    ];

    for(const chunk of this._buffer) {
      if(!chunk.segment) break;
      playlist.push(
        `#EXTINF:${chunkDuration},`,
        `${baseUrl}?hls=${chunk.seq}`
      );
    }

    if(end) {
      playlist.push('#EXT-X-ENDLIST');
    }

    return playlist.join('\n');
  }

  private onHlsTimeout = () => {
    const log = this._log.bindPrefix('onHlsTimeout');
    log('hls playlist refetch timeout');
    if(this._hlsWaitingForBuffer.length || this._hlsWaitingForChunk.size) {
      log('still active (some fetch is pending)');
      this.setDeadTimeout(this.onHlsTimeout, HLS_TIMEOUT);
      return;
    }

    log('destroying due to inactivity');
    this.destroy();
  }

  public async getHlsPlaylist(baseUrl: string): Promise<string> {
    const log = this._log.bindPrefix('getHlsPlaylist');
    log('getting hls playlist');

    this.setDeadTimeout(this.onHlsTimeout, HLS_TIMEOUT);

    if(this._generation !== 0) {
      return this.generateHlsPlaylist(baseUrl);
    }

    this.start();

    return new Promise<string>((resolve) => {
      const reject = (err: unknown) => {
        log('hls playlist fetch error, returning empty+end', err);
        resolve(this.generateHlsPlaylist(baseUrl, true));
      };
      this._pendingRejects.push(reject);
      this._hlsWaitingForBuffer.push(() => {
        const idx = this._pendingRejects.indexOf(reject);
        if(idx !== -1) {
          this._pendingRejects.splice(idx, 1);
        }

        resolve(this.generateHlsPlaylist(baseUrl));
      });
    })
  }

  public getInitChunk() {
    return this._initChunk?.data;
  }

  public async getHlsChunk(seq: number): Promise<Uint8Array> {
    const log = this._log.bindPrefix('getHlsChunk');
    log('getting hls chunk', seq);

    const chunk = this._buffer.find((chunk) => chunk.seq === seq);

    if(chunk && chunk.segment) return chunk.segment;

    // either we're not ready yet or the chunk is too old
    if(this._buffer.length && seq < this._buffer[0].seq) {
      log('hls chunk to old', seq);
      log(this._buffer);
      return;
    }

    return new Promise<Uint8Array>((resolve, reject) => {
      const interval = ctx.setInterval(() => {
        if(this._buffer.length && seq < this._buffer[0].seq) {
          // chunk is now too old
          log('hls chunk fetch timeout', seq);
          resolve(undefined);
        }
      }, this._chunkTime ?? 500);
      const rejectWrap = (err: unknown) => {
        clearInterval(interval);
        reject(err);
      };

      const waiters = this._hlsWaitingForChunk.get(seq) || [];

      waiters.push((chunk) => {
        const idx = this._pendingRejects.indexOf(rejectWrap);
        if(idx !== -1) {
          this._pendingRejects.splice(idx, 1);
        }

        clearInterval(interval);
        resolve(chunk);
      });
      this._pendingRejects.push(rejectWrap);

      this._hlsWaitingForChunk.set(seq, waiters);
    });
  }
}

async function getRtmpFetchResponse(event: FetchEvent, params: string, search: string): Promise<Response> {
  const call = JSON.parse(decodeURIComponent(params));
  let pending = pendingStreams.get(call.id);

  const isHls = search?.startsWith('hls=');

  // if(pending && !isHls) {
  //   pending.destroy();
  //   pending = undefined;
  // }

  const client = await ctx.clients.get(event.clientId);
  const accountNumber = getCurrentAccountFromURL(client.url);

  if(!pending) {
    log('creating rtmp stream', call.id);
    pending = new RtmpStream(call, accountNumber);
    pendingStreams.set(call.id, pending);
  }

  if(isHls) {
    search = search.split('&t=')[0];
    const baseUrl = event.request.url.split('?')[0];
    const chunk = search.slice(4);

    if(chunk === 'playlist') {
      return pending.getHlsPlaylist(baseUrl).then((r) => new Response(r, {
        headers: {
          'Content-Type': HLS_MIME
        }
      }));
    }

    if(chunk === 'init') {
      const init = pending.getInitChunk();

      if(!init) {
        return new Response('', {status: 404});
      }

      return new Response(init, {
        headers: {
          'Content-Type': MP4_MIME
        }
      });
    }

    const seq = Number(chunk);
    if(isNaN(seq)) {
      return new Response('', {status: 404});
    }

    return pending.getHlsChunk(seq).then((r) => {
      if(!r) {
        return new Response('', {status: 404});
      }

      return new Response(r, {
        headers: {
          'Content-Type': MP4_MIME
        }
      });
    });
  }

  return new Response(pending.createStream(), {
    headers: {
      'Content-Type': 'video/mp4'
    }
  });
}

export function onRtmpFetch(event: FetchEvent, params: string, search: string) {
  const responsePromise = getRtmpFetchResponse(event, params, search)
  event.respondWith(responsePromise);
}


export function onRtmpLeftCall([callId, forever]: [Long, boolean]) {
  const stream = pendingStreams.get(callId + '');
  if(stream) {
    stream.destroy();
  }
  if(IS_SAFARI && forever) {
    lastKnownTime.delete(callId);
  }
}
