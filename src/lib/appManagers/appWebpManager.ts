// @ts-ignore
//import createWorker from 'offscreen-canvas/create-worker';

class AppWebpManager {
  public webpMachine: any = null;
  public loaded: Promise<void>;
  public busyPromise: Promise<string>;
  public queue: {bytes: Uint8Array, img: HTMLImageElement}[] = [];
  //public worker: any;

  constructor() {
    //let canvas = document.createElement('canvas');
    //console.log('got message from worker:', canvas.toDataURL());
    /* this.worker = createWorker(canvas, '/webp.bundle.js', (e: any) => {
      // Messages from the worker
      console.log('got message from worker:', e, canvas.toDataURL());
    }); */

    this.loaded = new Promise((resolve, reject) => {
      (window as any).webpLoaded = () => {
        console.log('webpHero loaded');
        this.webpMachine = new (window as any).WebpMachine();
        resolve();
      };
  
      let sc = document.createElement('script');
      sc.src = 'webp.bundle.js';
      sc.async = true;
      sc.onload = (window as any).webpLoaded;
  
      document.body.appendChild(sc);

      resolve();
    });
  }

  convert(bytes: Uint8Array): Promise<string> {
    return this.webpMachine.decode(bytes);
    //return this.worker.post({message: 'webpBytes', bytes});
  }
  
  async processQueue() {
    if(this.busyPromise) return;

    let {img, bytes} = this.queue.pop();

    await this.loaded;

    this.busyPromise = this.convert(bytes);
    img.src = await this.busyPromise;

    this.busyPromise = null;

    if(this.queue.length) {
      this.processQueue();
    }
  }

  async polyfillImage(img: HTMLImageElement, blob: Blob) {
    /* console.log('polyfillImage', this);
    return this.webpMachine.polyfillImage(image); */

    if(await this.webpMachine.webpSupport) {
      img.src = URL.createObjectURL(blob);
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('loadend', async(e) => {
      // @ts-ignore
      let bytes = new Uint8Array(e.srcElement.result);
      
      this.queue.push({bytes, img});
      this.processQueue();
    });
    reader.readAsArrayBuffer(blob);
  }
}

export default new AppWebpManager();
