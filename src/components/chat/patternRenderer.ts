/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import indexOfAndSplice from "../../helpers/array/indexOfAndSplice";
import deepEqual from "../../helpers/object/deepEqual";
import { renderImageFromUrlPromise } from "../../helpers/dom/renderImageFromUrl";
import mediaSizes, { ScreenSize } from "../../helpers/mediaSizes";

type ChatBackgroundPatternRendererInitOptions = {
  url: string,
  width: number,
  height: number,
  mask?: boolean
};

export default class ChatBackgroundPatternRenderer {
  private static INSTANCES: ChatBackgroundPatternRenderer[] = [];

  // private pattern: CanvasPattern;
  private objectUrl: string;
  private options: ChatBackgroundPatternRendererInitOptions;
  private canvases: Set<HTMLCanvasElement>;
  // private createCanvasPatternPromise: Promise<CanvasPattern>;
  // private exportCanvasPatternToImagePromise: Promise<string>;
  private renderImageFromUrlPromise: Promise<HTMLImageElement>;
  private img: HTMLImageElement;

  constructor() {
    this.canvases = new Set();
  }

  public static getInstance(options: ChatBackgroundPatternRendererInitOptions) {
    let instance = this.INSTANCES.find((instance) => {
      return deepEqual(instance.options, options);
    });

    if(!instance) {
      instance = new ChatBackgroundPatternRenderer();
      instance.init(options);
      this.INSTANCES.push(instance);
    }

    return instance;
  }

  public init(options: ChatBackgroundPatternRendererInitOptions) {
    // if(this.options) {
    //   if(this.options.width !== options.width || this.options.height !== options.height) {
    //     this.createCanvasPatternPromise = 
    //       this.pattern = 
    //       this.exportCanvasPatternToImagePromise = 
    //       undefined;
    //   }
    // }

    this.options = options;
  }

  public renderToCanvas(canvas: HTMLCanvasElement) {
    // return this.createCanvasPattern(canvas).then(() => {
      // return this.fillCanvas(canvas);
    // });

    return this.renderImageFromUrl(this.options.url).then(() => {
      return this.fillCanvas(canvas);
    });
  }

  private renderImageFromUrl(url: string) {
    if(this.renderImageFromUrlPromise) return this.renderImageFromUrlPromise;
    const img = this.img = document.createElement('img');
    img.crossOrigin = 'anonymous';
    return this.renderImageFromUrlPromise = renderImageFromUrlPromise(img, url, false).then(() => img);
  }

  /* private createCanvasPattern(canvas: HTMLCanvasElement) {
    if(this.createCanvasPatternPromise) return this.createCanvasPatternPromise;
    return this.createCanvasPatternPromise = this.renderImageFromUrl(this.options.url).then((img) => {
      let createPatternFrom: HTMLImageElement | HTMLCanvasElement;
      if(IS_SAFARI) {
        const canvas = createPatternFrom = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      } else {
        createPatternFrom = img;
      }
      
      const perf = performance.now();
      this.pattern = canvas.getContext('2d').createPattern(createPatternFrom, 'repeat-x');
      console.warn('creating pattern time:', performance.now() - perf);

      return this.pattern;
    });
  }

  public exportCanvasPatternToImage(canvas: HTMLCanvasElement) {
    if(this.exportCanvasPatternToImagePromise) return this.exportCanvasPatternToImagePromise;
    return this.exportCanvasPatternToImagePromise = new Promise<string>((resolve) => {
      canvas.toBlob((blob) => {
        const newUrl = this.objectUrl = URL.createObjectURL(blob);
        resolve(newUrl);
      }, 'image/png');
    });
  } */

  public cleanup(canvas: HTMLCanvasElement) {
    this.canvases.delete(canvas);

    if(!this.canvases.size) {
      indexOfAndSplice(ChatBackgroundPatternRenderer.INSTANCES, this);

      if(this.objectUrl) {
        URL.revokeObjectURL(this.objectUrl);
      }
    }
  }

  public fillCanvas(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if(context.fillStyle instanceof CanvasPattern) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }

    // const perf = performance.now();
    const img = this.img;

    let imageWidth = img.width, imageHeight = img.height;
    // if(imageHeight < canvas.height) {
      const ratio = canvas.height / imageHeight;
      imageWidth *= ratio;
      imageHeight = canvas.height;
    // }

    if(this.options.mask) {
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.globalCompositeOperation = 'destination-out';
    } else {
      context.globalCompositeOperation = 'source-over';
    }

    for(let x = 0; x < canvas.width; x += imageWidth) {
      for(let y = 0; y < canvas.height; y += imageHeight) {
        context.drawImage(img, x, y, imageWidth, imageHeight);
      }
    }
    // context.fillStyle = this.pattern;
    // context.fillRect(0, 0, canvas.width, canvas.height);
    // console.warn('fill canvas time', performance.now() - perf);
  }

  public setCanvasDimensions(canvas: HTMLCanvasElement) {
    const devicePixelRatio = Math.min(2, window.devicePixelRatio);
    canvas.width = this.options.width * devicePixelRatio;
    canvas.height = this.options.height * devicePixelRatio * (mediaSizes.activeScreen === ScreenSize.large ? 1.5 : 1);
  }

  public createCanvas() {
    const canvas = document.createElement('canvas');
    this.canvases.add(canvas);
    this.setCanvasDimensions(canvas);
    return canvas;
  }

  public resize(width: number, height: number) {
    this.init({
      ...this.options,
      width,
      height
    });

    const promises: Promise<any>[] = [];
    for(const canvas of this.canvases) {
      this.setCanvasDimensions(canvas);
      promises.push(this.renderToCanvas(canvas));
    }

    return Promise.all(promises);
  }

  public static resizeInstances(width: number, height: number) {
    return Promise.all(this.INSTANCES.map(instance => instance.resize(width, height)));
  }

  /* public setResizeMode(resizing: boolean) {
    const canvases = Array.from(this.canvases);
    const canvas = canvases[canvases.length - 1];
    canvas.style.display = resizing ? 'none' : '';
    const img = this.img;
    img.style.display = resizing ? '' : 'none';

    return {img, canvas};
  } */
}
