class AppWebpManager {
  private webpMachine: any = null;
  private loaded: Promise<void>;
  private busyPromise: Promise<Uint8Array | void>;
  private queue: {bytes: Uint8Array, callback: (res: Uint8Array) => void}[] = [];

  private testPromise: Promise<boolean> = null;
  public webpSupport = false;

  constructor() {
    this.testWebpSupport();
  }

  private loadWebpHero() {
    if(this.loaded) return this.loaded;

    this.loaded = new Promise(async(resolve, reject) => {
      let res = await this.testWebpSupport();

      if(!res) {
        (window as any).webpLoaded = () => {
          //console.log('webpHero loaded');
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

  private convert(bytes: Uint8Array): AppWebpManager['busyPromise'] {
    return this.webpMachine.decode(bytes);
  }
  
  private async processQueue() {
    if(this.busyPromise) return;

    this.busyPromise = Promise.resolve();

    let {bytes, callback} = this.queue.pop();

    if(!this.loaded) {
      this.loadWebpHero();
    }

    await this.loaded;

    this.busyPromise = this.convert(bytes);
    let res = await this.busyPromise;

    //console.log('converted webp', res);

    callback(res as Uint8Array);

    this.busyPromise = null;

    if(this.queue.length) {
      this.processQueue();
    }
  }

  public testWebpSupport() {
    if(this.testPromise) return this.testPromise;

    return this.testPromise = new Promise((resolve, reject) => {
      let webP = new Image();     
      webP.src = 'data:image/webp;base64,UklGRi4AAABXRUJQVlA4TCEAAAAvAUAAEB8wAiMw' + 
        'AgSSNtse/cXjxyCCmrYNWPwmHRH9jwMA';
      webP.onload = webP.onerror = () => {
        resolve(this.webpSupport = webP.height === 2/*  && false */);     
      };
    });
  }

  public isSupported() {
    return this.webpSupport;
  }

  public convertToPng(bytes: Uint8Array) {
    //console.warn('convertToPng!');
    return new Promise<Uint8Array>((resolve, reject) => {
      // @ts-ignore
      this.queue.push({bytes, callback: resolve});
      this.processQueue();
    });
  }
}

const appWebpManager = new AppWebpManager();
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).appWebpManager = appWebpManager;
}
export default appWebpManager;
