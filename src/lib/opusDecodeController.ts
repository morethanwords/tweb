/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MOUNT_CLASS_TO } from "../config/debug";
import { isSafari } from "../helpers/userAgent";
import { logger, LogTypes } from "./logger";

type Result = {
  bytes: Uint8Array, 
  waveform?: Uint8Array
};

type Task = {
  pages: Uint8Array,
  withWaveform: boolean,
  waveform?: Uint8Array,
  callback: {resolve: (result: Result) => void, reject: (err: any) => void},
  timeout: number
};

export class OpusDecodeController {
  private worker: Worker;
  private wavWorker : Worker;
  private sampleRate = 48000;
  private tasks: Array<Task> = [];
  private keepAlive = false;
  private isPlaySupportedResult: boolean;
  private log = logger('OPUS', LogTypes.Error);

  public isPlaySupported() {
    if(this.isPlaySupportedResult !== undefined) return this.isPlaySupportedResult;

    const audio = document.createElement('audio');
    return this.isPlaySupportedResult = !!(audio.canPlayType && audio.canPlayType('audio/ogg;').replace(/no/, ''))/*  && false */;
  }

  public loadWavWorker() {
    if(this.wavWorker) return;

    this.wavWorker = new Worker('waveWorker.min.js');
    this.wavWorker.addEventListener('message', (e) => {
      const data = e.data;

      this.log('[WAV] got message:', data);
      if(data && data.page) {
        const bytes = data.page;
        this.onTaskEnd(this.tasks.shift(), bytes);
      }
    });
  }

  public loadWorker() {
    if(this.worker) return;

    this.worker = new Worker('decoderWorker.min.js');
    this.worker.addEventListener('message', (e) => {
      const data = e.data;
      
      this.log('[DECODER] got message', data);
      if(data.type === 'done') {
        //this.log('[DECODER] send done to wav');
        this.wavWorker.postMessage({command: 'done'});

        if(data.waveform) {
          this.tasks[0].waveform = data.waveform;
        }
      } else { // e.data contains decoded buffers as float32 values
        //this.log('[DECODER] send encode to wav');
        this.wavWorker.postMessage({
          command: 'encode',
          buffers: e.data
        }, isSafari ? undefined : data.map((typedArray: Uint8Array) => typedArray.buffer));
      }
    });
  }

  public setKeepAlive(keepAlive: boolean) {
    this.keepAlive = keepAlive;
    if(this.keepAlive) {
      this.loadWorker();
      this.loadWavWorker();
    } else if(!this.tasks.length) {
      this.terminateWorkers();
    }
  }

  public onTaskEnd(task: Task, result?: Uint8Array) {
    if(!result) {
      task.callback.reject('timeout');
    } else {
      clearTimeout(task.timeout);
      task.callback.resolve({bytes: result, waveform: task.waveform});
    }

    if(this.tasks.length) {
      this.executeNewTask(this.tasks[0]);
    }

    this.terminateWorkers();
  }

  public terminateWorkers(kill = false) {
    if((this.keepAlive || this.tasks.length) && !kill) return;

    if(this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    if(this.wavWorker) {
      this.wavWorker.terminate();
      this.wavWorker = null;
    }
  }

  public executeNewTask(task: Task) {
    this.worker.postMessage({ 
      command: 'init',
      decoderSampleRate: this.sampleRate,
      outputBufferSampleRate: this.sampleRate
    });

    this.wavWorker.postMessage({ 
      command: 'init',
      wavBitDepth: 16,
      wavSampleRate: this.sampleRate
    });

    //console.log('sending command to worker:', task);
    //setTimeout(() => {
      this.log('[DECODER] send decode');
      this.worker.postMessage({
        command: 'decode',
        pages: task.pages,
        waveform: task.withWaveform
      }, isSafari ? undefined : [task.pages.buffer]);
    //}, 1e3);

    task.timeout = window.setTimeout(() => {
      this.log.error('decode timeout'/* , task */);

      this.terminateWorkers(true);
      if(this.tasks.length) {
        this.loadWorker();
        this.loadWavWorker();
      }

      this.onTaskEnd(this.tasks.shift());
    }, 10e3);
  }

  public pushDecodeTask(pages: Uint8Array, withWaveform: boolean) {
    return new Promise<Result>((resolve, reject) => {
      const task = {
        pages,
        withWaveform,
        callback: {resolve, reject},
        timeout: 0
      };

      this.loadWorker();
      this.loadWavWorker();

      if(this.tasks.push(task) === 1) {
        this.executeNewTask(task);
      }
    });
  }

  public async decode(typedArray: Uint8Array, withWaveform = false) {
    return this.pushDecodeTask(typedArray, withWaveform).then(result => {
      const dataBlob = new Blob([result.bytes], {type: "audio/wav"});
      return {url: URL.createObjectURL(dataBlob), waveform: result.waveform};
    });
  }
}

const opusDecodeController = new OpusDecodeController();
MOUNT_CLASS_TO.opusDecodeController = opusDecodeController;
export default opusDecodeController;