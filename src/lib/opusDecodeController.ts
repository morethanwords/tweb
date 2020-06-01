type Result = {
  bytes: Uint8Array, 
  waveform?: Uint8Array
};

type Task = {
  pages: Uint8Array,
  withWaveform: boolean,
  waveform?: Uint8Array,
  callback: {resolve: (result: Result) => void, reject: (err: Error) => void}
};

export class OpusDecodeController {
  private worker: Worker;
  private wavWorker : Worker;
  private sampleRate = 48000;
  private tasks: Array<Task> = [];
  private keepAlive = false;

  public loadWavWorker() {
    if(this.wavWorker) return;

    this.wavWorker = new Worker('waveWorker.min.js');
    this.wavWorker.addEventListener('message', (e) => {
      const data = e.data;

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
      
      if(data.type == 'done') {
        this.wavWorker.postMessage({command: 'done'});

        if(data.waveform) {
          this.tasks[0].waveform = data.waveform;
        }
      } else { // e.data contains decoded buffers as float32 values
        this.wavWorker.postMessage({
          command: 'encode',
          buffers: e.data
        }, data.map((typedArray: Uint8Array) => typedArray.buffer));
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

  public onTaskEnd(task: Task, result: Uint8Array) {
    task.callback.resolve({bytes: result, waveform: task.waveform});

    if(this.tasks.length) {
      this.executeNewTask(this.tasks[0]);
    }

    this.terminateWorkers();
  }

  public terminateWorkers() {
    if(this.keepAlive || this.tasks.length) return;

    this.worker.terminate();
    this.worker = null;

    this.wavWorker.terminate();
    this.wavWorker = null;
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
      this.worker.postMessage({
        command: 'decode',
        pages: task.pages,
        waveform: task.withWaveform
      }, [task.pages.buffer]);
    //}, 1e3);
  }

  public pushDecodeTask(pages: Uint8Array, withWaveform: boolean) {
    return new Promise<Result>((resolve, reject) => {
      const task = {
        pages,
        withWaveform,
        callback: {resolve, reject}
      };

      this.loadWorker();
      this.loadWavWorker();

      if(this.tasks.push(task) == 1) {
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

export default new OpusDecodeController();