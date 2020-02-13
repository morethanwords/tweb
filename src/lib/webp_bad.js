import insideWorker from 'offscreen-canvas/inside-worker';

console.log(self);

import { Webp } from "./libwebp.js";
let webp = new Webp();
webp.Module.doNotCaptureKeyboard = true;
webp.Module.noImageDecoding = true;

let canvas = null;

const worker = insideWorker(e => {
  if(e.data.canvas) {
    canvas = e.data.canvas;
    console.log(e, canvas);
    webp.setCanvas(canvas);
    //webp.webpToSdl()
    // Draw on the canvas
  } else if(e.data.message == 'webpBytes') {
    webp.webpToSdl(e.data.bytes, e.data.bytes.length);
    //console.log(canvas);
    self.postMessage({converted: true});
  }
});
