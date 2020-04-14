// @ts-ignore
//import createWorker from 'offscreen-canvas/create-worker';

class AppWebpManager {
  public webpMachine: any = null;
  public loaded: Promise<void>;
  public busyPromise: Promise<string>;
  public queue: {bytes: Uint8Array, img: HTMLImageElement, callback: () => void}[] = [];
  //public worker: any;
  public webpSupport: Promise<boolean> = null;

  constructor() {
    //let canvas = document.createElement('canvas');
    //console.log('got message from worker:', canvas.toDataURL());
    /* this.worker = createWorker(canvas, '/webp.bundle.js', (e: any) => {
      // Messages from the worker
      console.log('got message from worker:', e, canvas.toDataURL());
    }); */

    this.webpSupported().then(res => {
    });
  }

  public loadWebpHero() {
    if(this.loaded) return this.loaded;

    this.loaded = new Promise(async(resolve, reject) => {
      let res = await this.webpSupported();

      if(!res) {
        (window as any).webpLoaded = () => {
          console.log('webpHero loaded');
          this.webpMachine = new (window as any).WebpMachine();
          resolve();
        };
    
        let sc = document.createElement('script');
        sc.src = 'npm.webp-hero.chunk.js';
        sc.async = true;
        sc.onload = (window as any).webpLoaded;
    
        document.body.appendChild(sc);
      } else {
        resolve();
      }
    });
  }

  convert(bytes: Uint8Array): Promise<string> {
    return this.webpMachine.decode(bytes);
    //return this.worker.post({message: 'webpBytes', bytes});
  }
  
  async processQueue() {
    if(this.busyPromise) return;

    this.busyPromise = Promise.resolve('');

    let {img, bytes, callback} = this.queue.pop();

    if(!this.loaded) {
      this.loadWebpHero();
    }

    await this.loaded;

    this.busyPromise = this.convert(bytes);
    img.src = await this.busyPromise;
    callback();

    this.busyPromise = null;

    if(this.queue.length) {
      this.processQueue();
    }
  }

  webpSupported() {
    if(this.webpSupport) return this.webpSupport;

    return this.webpSupport = new Promise((resolve, reject) => {
      var webP = new Image();     
      webP.src = 'data:image/webp;base64,UklGRi4AAABXRUJQVlA4TCEAAAAvAUAAEB8wAiMw' + 
        'AgSSNtse/cXjxyCCmrYNWPwmHRH9jwMA';
      webP.onload = webP.onerror = () => {
        resolve(webP.height === 2);     
      };
    });
  }

  async polyfillImage(img: HTMLImageElement, blob: Blob) {
    /* console.log('polyfillImage', this);
    return this.webpMachine.polyfillImage(image); */

    //if(await this.webpMachine.webpSupport) {
    if(await this.webpSupport) {
      img.src = URL.createObjectURL(blob);
      return;
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('loadend', (e) => {
        // @ts-ignore
        let bytes = new Uint8Array(e.srcElement.result);
        
        this.queue.push({bytes, img, callback: resolve});
        this.processQueue();
      });
      reader.readAsArrayBuffer(blob);
    });
  }
}

export default new AppWebpManager();
