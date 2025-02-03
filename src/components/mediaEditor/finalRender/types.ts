import {Document} from '../../../layer';

export interface StickerFrameByFrameRenderer {
  init: (doc: Document.document, size: number) => Promise<void>;
  getTotalFrames: () => number;
  getRatio: () => number;
  renderFrame: (frame: number) => Promise<void>;
  getRenderedFrame: () => CanvasImageSource;
  destroy: () => void;
}
