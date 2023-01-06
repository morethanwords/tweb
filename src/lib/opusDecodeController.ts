/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MOUNT_CLASS_TO} from '../config/debug';
import IS_OPUS_SUPPORTED from '../environment/opusSupport';
import {IS_SAFARI} from '../environment/userAgent';
import {Modify} from '../types';
import {logger, LogTypes} from './logger';
import apiManagerProxy from './mtproto/mtprotoworker';
import type {ConvertWebPTask} from './webp/webpWorkerController';

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

export interface ConvertOpusTask extends Modify<ConvertWebPTask, {type: 'convertOpus'}> {
  type: 'convertOpus'
}

export class OpusDecodeController {
  private worker: Worker;
  private wavWorker: Worker;
  private sampleRate = 48000;
  private tasks: Array<Task> = [];
  private keepAlive = false;
  private log = logger('OPUS', LogTypes.Error);

  public isPlaySupported() {
    return IS_OPUS_SUPPORTED;
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
        // this.log('[DECODER] send done to wav');
        this.wavWorker.postMessage({command: 'done'});

        if(data.waveform) {
          this.tasks[0].waveform = data.waveform;
        }
      } else { // e.data contains decoded buffers as float32 values
        // this.log('[DECODER] send encode to wav');
        this.wavWorker.postMessage({
          command: 'encode',
          buffers: e.data
        }, IS_SAFARI ? undefined : data.map((typedArray: Uint8Array) => typedArray.buffer));
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

    // console.log('sending command to worker:', task);
    // setTimeout(() => {
    this.log('[DECODER] send decode');
    this.worker.postMessage({
      command: 'decode',
      pages: task.pages,
      waveform: task.withWaveform
    }, IS_SAFARI ? undefined : [task.pages.buffer]);
    // }, 1e3);

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
    return this.pushDecodeTask(typedArray, withWaveform).then(async(result) => {
      const dataBlob = new Blob([result.bytes], {type: 'audio/wav'});
      return {url: await apiManagerProxy.invoke('createObjectURL', dataBlob), waveform: result.waveform};
    });
  }
}

const opusDecodeController = new OpusDecodeController();
MOUNT_CLASS_TO.opusDecodeController = opusDecodeController;
export default opusDecodeController;
