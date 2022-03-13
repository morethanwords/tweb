/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { IS_SAFARI } from "../../environment/userAgent";
import { indexOfAndSplice } from "../../helpers/array";
import { renderImageFromUrlPromise } from "../../helpers/dom/renderImageFromUrl";
import { deepEqual } from "../../helpers/object";

type ChatBackgroundPatternRendererInitOptions = {
  url: string,
  width: number,
  height: number
};

export default class ChatBackgroundPatternRenderer {
  private static INSTANCES: ChatBackgroundPatternRenderer[] = [];

  private pattern: CanvasPattern;
  private objectUrl: string;
  private options: ChatBackgroundPatternRendererInitOptions;
  private canvases: Set<HTMLCanvasElement>;
  private createCanvasPatternPromise: Promise<void>;
  private exportCanvasPatternToImagePromise: Promise<string>;
  // private img: HTMLImageElement;

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
    this.options = options;
  }

  public renderToCanvas(canvas: HTMLCanvasElement) {
    return this.createCanvasPattern(canvas).then(() => {
      return this.fillCanvas(canvas);
    });
  }

  private createCanvasPattern(canvas: HTMLCanvasElement) {
    if(this.createCanvasPatternPromise) return this.createCanvasPatternPromise;
    return this.createCanvasPatternPromise = new Promise((resolve) => {
      const img = document.createElement('img');
      img.crossOrigin = 'anonymous';
      renderImageFromUrlPromise(img, this.options.url, false).then(() => {
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
        
        // this.img = img;
        this.pattern = canvas.getContext('2d').createPattern(createPatternFrom, 'repeat-x');
        resolve();
      });
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
  }

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
    context.fillStyle = this.pattern;
    context.fillRect(0, 0, canvas.width, canvas.height);
    // context.drawImage(this.img, 0, 0, canvas.width, canvas.height);
  }

  public setCanvasDimensions(canvas: HTMLCanvasElement) {
    canvas.width = this.options.width * window.devicePixelRatio;
    canvas.height = this.options.height * window.devicePixelRatio * 1.5;
  }

  public createCanvas() {
    const canvas = document.createElement('canvas');
    this.canvases.add(canvas);
    this.setCanvasDimensions(canvas);
    return canvas;
  }
}
