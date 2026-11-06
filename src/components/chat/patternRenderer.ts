import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import clearMediaElementSource from '@helpers/dom/clearMediaElementSource';
import deepEqual from '@helpers/object/deepEqual';
import {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';
import mediaSizes, {ScreenSize} from '@helpers/mediaSizes';
import windowSize from '@helpers/windowSize';
import IS_IMAGE_BITMAP_SUPPORTED from '@environment/imageBitmapSupport';
import {IS_FIREFOX} from '@environment/userAgent';
import {getMiddleware} from '@helpers/middleware';
import noop from '@helpers/noop';
import type {MyDocument} from '@appManagers/appDocsManager';
import {chooseGiftSymbolIndex, GiftPatternSymbol, parseGiftPatternSymbols} from '@components/chat/giftPatternSymbols';

const SCALE_PATTERN = false;
const USE_BITMAP = IS_IMAGE_BITMAP_SUPPORTED && IS_FIREFOX;
// * as tdesktop draws them
const GIFT_SYMBOL_ALPHA = .8;
const GIFT_SYMBOL_SIZE = 128;

type ChatBackgroundPatternRendererInitOptions = {
  element: HTMLElement;
  url: string,
  width: number,
  height: number,
  mask?: boolean,
  // * the gift's pattern emoji, put into the slots the gift theme's pattern marks
  giftSymbol?: MyDocument
};

/** Where the gift itself goes on a canvas, in CSS pixels. */
export type GiftPatternArea = {
  left: number,
  top: number,
  width: number,
  height: number,
  rotation: number
};

type GiftSymbols = {
  symbols: GiftPatternSymbol[],
  image: HTMLCanvasElement,
  giftIndex: number
};

export default class ChatBackgroundPatternRenderer {
  private static INSTANCES: ChatBackgroundPatternRenderer[] = [];

  // private pattern: CanvasPattern;
  // private objectUrl: string;
  private options: ChatBackgroundPatternRendererInitOptions;
  private canvases: Set<HTMLCanvasElement>;
  // private createCanvasPatternPromise: Promise<CanvasPattern>;
  // private exportCanvasPatternToImagePromise: Promise<string>;
  private renderImageFromUrlPromise: Promise<HTMLImageElement>;
  private image: HTMLImageElement;
  private imageBitmap: ImageBitmap;
  private giftSymbolsPromise: Promise<void>;
  private giftSymbols: GiftSymbols;
  private giftSymbolsMiddlewareHelper: ReturnType<typeof getMiddleware>;
  private giftAreaListeners: Map<HTMLCanvasElement, (area: GiftPatternArea | undefined) => void>;

  constructor() {
    this.canvases = new Set();
    this.giftAreaListeners = new Map();
  }

  public static getInstance(options: ChatBackgroundPatternRendererInitOptions) {
    let instance = this.INSTANCES.find((instance) => {
      return instance.options.element === options.element && deepEqual(instance.options, options, ['element']);
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

    // * the gift's symbols come later, drawn over again once they are here: their download must not
    // * hold up the chat the background belongs to
    this.loadGiftSymbols();
    return this.renderImageFromUrl(this.options.url).then(() => {
      return this.fillCanvas(canvas);
    });
  }

  /** Tells where the gift goes on `canvas` after every render of it. */
  public setGiftAreaListener(canvas: HTMLCanvasElement, listener: (area: GiftPatternArea | undefined) => void) {
    this.giftAreaListeners.set(canvas, listener);
  }

  private loadGiftSymbols() {
    const {giftSymbol, url} = this.options;
    if(!giftSymbol || this.giftSymbolsPromise) {
      return;
    }

    const middlewareHelper = this.giftSymbolsMiddlewareHelper = getMiddleware();
    const middleware = middlewareHelper.get();
    const symbolsPromise = fetch(url).then((response) => response.text()).then(parseGiftPatternSymbols);
    // * the symbol painted black, the colour of the pattern itself
    const imagePromise = import('@components/wrappers/emojiPattern').then(({default: wrapEmojiPattern}) => {
      return wrapEmojiPattern({
        docId: giftSymbol,
        middleware,
        color: '#000000',
        positions: [[0, 0, GIFT_SYMBOL_SIZE, 1]],
        canvasWidth: GIFT_SYMBOL_SIZE,
        canvasHeight: GIFT_SYMBOL_SIZE,
        emojiSize: GIFT_SYMBOL_SIZE
      });
    });

    this.giftSymbolsPromise = Promise.all([symbolsPromise, imagePromise, this.renderImageFromUrl(url)]).then(([symbols, image]) => {
      if(!middleware() || !symbols.length || !image) {
        return;
      }

      this.giftSymbols = {symbols, image, giftIndex: chooseGiftSymbolIndex(symbols)};
      for(const canvas of this.canvases) {
        // * resizing resets the canvas, so the pattern is drawn anew rather than over itself
        this.setCanvasDimensions(canvas);
        this.fillCanvas(canvas);
      }
    }).catch(noop);
  }

  private renderImageFromUrl(url: string) {
    if(this.renderImageFromUrlPromise) return this.renderImageFromUrlPromise;
    const img = this.image = document.createElement('img');
    img.crossOrigin = 'anonymous';
    return this.renderImageFromUrlPromise = renderImageFromUrlPromise(img, url, false).then(() => {
      if(!IS_IMAGE_BITMAP_SUPPORTED || !USE_BITMAP) {
        return img;
      }

      return createImageBitmap(img, {
        resizeWidth: 1440,
        resizeHeight: 2960
      }).then((imageBitmap) => {
        this.imageBitmap = imageBitmap;
        return img;
      });
    }).catch((error) => {
      clearMediaElementSource(img);
      throw error;
    });
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
    this.giftAreaListeners.delete(canvas);

    if(!this.canvases.size) {
      indexOfAndSplice(ChatBackgroundPatternRenderer.INSTANCES, this);

      this.imageBitmap?.close();
      this.image && clearMediaElementSource(this.image);
      this.giftSymbolsMiddlewareHelper?.destroy();
      // if(this.objectUrl) {
      //   URL.revokeObjectURL(this.objectUrl);
      // }
    }
  }

  public fillCanvas(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    const {width, height} = canvas;
    // const perf = performance.now();
    // if(context.fillStyle instanceof CanvasPattern) {
    //   context.clearRect(0, 0, width, height);
    // }

    const source = this.imageBitmap || this.image;

    let imageWidth = source.width, imageHeight = source.height;
    // let patternHeight = 1480 * canvas.dpr;
    // if(+canvas.dataset.originalHeight !== height) patternHeight *= .6875;
    const patternHeight = (500 + (windowSize.height / 2.5)) * canvas.dpr;
    const ratio = patternHeight / imageHeight;
    imageWidth *= ratio;
    imageHeight = patternHeight;

    if(this.options.mask) {
      context.fillStyle = '#000';
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = 'destination-out';
    } else {
      context.globalCompositeOperation = 'source-over';
    }

    const centerY = (height - imageHeight) / 2;
    const giftSymbols = this.giftSymbols;
    // * the gift goes into its slot of the tile in the middle, the symbol everywhere else
    const giftColumn = Math.floor(width / 2 / imageWidth);
    let giftArea: GiftPatternArea;
    const drawSymbols = (column: number, y: number) => {
      const x = column * imageWidth;
      giftSymbols.symbols.forEach((symbol, idx) => {
        const symbolWidth = symbol.width * imageWidth;
        const symbolHeight = symbol.height * imageHeight;
        const left = x + symbol.x * imageWidth;
        const top = y + symbol.y * imageHeight;
        if(idx === giftSymbols.giftIndex && column === giftColumn && y === centerY) {
          const dpr = canvas.dpr || 1;
          giftArea = {
            left: left / dpr,
            top: top / dpr,
            width: symbolWidth / dpr,
            height: symbolHeight / dpr,
            rotation: symbol.rotation
          };
          return;
        }

        context.save();
        context.translate(left + symbolWidth / 2, top + symbolHeight / 2);
        context.rotate(symbol.rotation * Math.PI / 180);
        context.globalAlpha = GIFT_SYMBOL_ALPHA;
        context.drawImage(giftSymbols.image, -symbolWidth / 2, -symbolHeight / 2, symbolWidth, symbolHeight);
        context.restore();
      });
    };

    const d = (y: number) => {
      for(let column = 0, x = 0; x < width; x = ++column * imageWidth) {
        context.drawImage(source, x, y, imageWidth, imageHeight);
        giftSymbols && drawSymbols(column, y);
      }
    };

    d(centerY);

    if(centerY > 0) {
      let topY = centerY;
      do {
        d(topY -= imageHeight);
      } while(topY >= 0);
    }

    const endY = height - 1;
    for(let bottomY = centerY + imageHeight; bottomY < endY; bottomY += imageHeight) {
      d(bottomY);
    }

    this.giftAreaListeners.get(canvas)?.(giftArea);

    // for(let x = 0; x < width; x += imageWidth) {
    //   for(let y = 0; y < height; y += imageHeight) {
    //     context.drawImage(img, x, y, imageWidth, imageHeight);
    //   }
    // }
    // context.fillStyle = this.pattern;
    // context.fillRect(0, 0, width, height);
    // console.warn('fill canvas time', performance.now() - perf);
  }

  public setCanvasDimensions(canvas: HTMLCanvasElement) {
    const devicePixelRatio = Math.min(2, window.devicePixelRatio);
    const width = this.options.width * devicePixelRatio;
    let height = this.options.height * devicePixelRatio;

    canvas.dpr = devicePixelRatio;
    canvas.dataset.originalHeight = '' + height;
    if(mediaSizes.activeScreen === ScreenSize.large && SCALE_PATTERN) height *= 1.5;
    canvas.width = width;
    canvas.height = height;
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

  public static resizeInstancesOf(element: HTMLElement) {
    const toResize = this.INSTANCES.filter(instance => instance.options.element === element);

    const rect = element.getBoundingClientRect();

    return Promise.all(toResize.map((instance) => instance.resize(rect.width, rect.height)));
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
