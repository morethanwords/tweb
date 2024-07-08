import {MediaEditorTabs} from './media-editor/editor-tabs';
import {EditorHeader} from './media-editor/editor-header';
import {MediaEditorSlider} from './media-editor/editor-slider';
import {MediaEditorGeneralSettings} from './media-editor/editor-general-settings';
import {createEffect, createSignal, onMount} from 'solid-js';

function auto_adjust(context: CanvasRenderingContext2D, W: number, H: number) {
  // settings
  var white = 240;    // white color min
  var black = 30;     // black color max
  var target_white = 1;   // how much % white colors should take
  var target_black = 0.5; // how much % black colors should take
  var modify = 1.1;   // color modify strength

  var img = context.getImageData(0, 0, W, H);
  var imgData = img.data;
  var n = 0;  // pixels count without transparent

  // make sure we have white
  var n_valid = 0;
  for(var i = 0; i < imgData.length; i += 4) {
    if(imgData[i+3] == 0) continue; // transparent
    if((imgData[i] + imgData[i+1] + imgData[i+2]) / 3 > white) n_valid++;
    n++;
  }
  let target = target_white;
  var n_fix_white = 0;
  var done = false;
  for(var j=0; j < 30; j++) {
    if(n_valid * 100 / n >= target) done = true;
    if(done == true) break;
    n_fix_white++;

    // adjust
    for(var i = 0; i < imgData.length; i += 4) {
      if(imgData[i+3] == 0) continue; // transparent
      for(var c = 0; c < 3; c++) {
        var x = i + c;
        if(imgData[x] < 10) continue;
        // increase white
        imgData[x] *= modify;
        imgData[x] = Math.round(imgData[x]);
        if(imgData[x] > 255) imgData[x] = 255;
      }
    }

    // recheck
    n_valid = 0;
    for(var i = 0; i < imgData.length; i += 4) {
      if(imgData[i+3] == 0) continue; // transparent
      if((imgData[i] + imgData[i+1] + imgData[i+2]) / 3 > white) n_valid++;
    }
  }

  // make sure we have black
  n_valid = 0;
  for(var i = 0; i < imgData.length; i += 4) {
    if(imgData[i+3] == 0) continue; // transparent
    if((imgData[i] + imgData[i+1] + imgData[i+2]) / 3 < black) n_valid++;
  }
  target = target_black;
  var n_fix_black = 0;
  var done = false;
  for(var j=0; j < 30; j++) {
    if(n_valid * 100 / n >= target) done = true;
    if(done == true) break;
    n_fix_black++;

    // adjust
    for(var i = 0; i < imgData.length; i += 4) {
      if(imgData[i+3] == 0) continue; // transparent
      for(var c = 0; c < 3; c++) {
        var x = i + c;
        if(imgData[x] > 240) continue;
        // increase black
        imgData[x] -= (255-imgData[x]) * modify - (255-imgData[x]);
        imgData[x] = Math.round(imgData[x]);
      }
    }

    // recheck
    n_valid = 0;
    for(var i = 0; i < imgData.length; i += 4) {
      if(imgData[i+3] == 0) continue; // transparent
      if((imgData[i] + imgData[i+1] + imgData[i+2]) / 3 < black) n_valid++;
    }
  }

  //  save
  context.putImageData(img, 0, 0);
  //  log('Iterations: brighten='+n_fix_white+", darken="+n_fix_black);
}

async function adjustGamma(initial: any, ctx: CanvasRenderingContext2D, width: number, height: number, gamma: number) {
  const gammaCorrection = 1 / gamma;
  const copyData = ctx.createImageData(width, height);
  copyData.data.set(initial.data);
  const data = copyData.data;

  for(let i = 0; i < data.length; i += 4) {
    data[i] = 255 * Math.pow((data[i] / 255), gammaCorrection);
    data[i+1] = 255 * Math.pow((data[i+1] / 255), gammaCorrection);
    data[i+2] = 255 * Math.pow((data[i+2] / 255), gammaCorrection);
  }
  ctx.putImageData(copyData, 0, 0);
}

export const AppMediaEditor = ({imageBlobUrl, close} : { imageBlobUrl: string, close: (() => void) }) => {
  let canvas: HTMLCanvasElement;
  let context: CanvasRenderingContext2D;
  let myImgElement: HTMLImageElement;
  let container: HTMLDivElement;

  onMount(() => {
    const img = new Image();
    img.src = imageBlobUrl;
    img.onload = () => {
      canvas.width = container.clientWidth * 2;
      canvas.height = container.clientHeight;

      console.info('img', img.width, img.height);
      console.info('canvas', canvas.width, canvas.height);

      // canvas.width = img.width;
      // canvas.height = img.height;

      // img.width
      // img.height
      context = canvas.getContext('2d');
      // context.scale(canvas.width / myImgElement.width, canvas.height / myImgElement.height);
      // context.scale(canvas.width / myImgElement.width, canvas.height / myImgElement.height);
      context.drawImage(myImgElement, 0, 0, img.width, img.height, 0, 0, canvas.width, canvas.height);
      // let i = 0.1;

      const initialData = context.createImageData(canvas.width, canvas.height);
      initialData.data.set(context.getImageData(0.0, 0.0, canvas.width, canvas.height).data);

      createEffect(() => {
        console.warn(data());
      });

      /* setInterval(() => {
        console.warn('updating this shit', i);
        adjustGamma(initialData, context, canvas.width, canvas.height, i);
        i += 0.05;
      }, 500); */
    };
  });

  const [data, setData] = createSignal();

  createEffect(() => {
    console.info(data());
  });

  const test = [
    <MediaEditorGeneralSettings change={val => console.log(val)} />,
    <span>Tab 1</span>,
    <span>Tab 2</span>,
    <span>Tab 3</span>,
    <span>Tab 4</span>
  ];

  return <div class='media-editor' onClick={() => close()}>
    <div class='media-editor__container' onClick={ev => ev.stopImmediatePropagation()}>
      <div ref={container} class='media-editor__main-area'>
        <div class='images'>
          <img ref={myImgElement} src={imageBlobUrl} />
          <img src={imageBlobUrl} />
        </div>

        <canvas ref={canvas} />

      </div>
      <div class='media-editor__settings'>
        <EditorHeader undo={null} redo={null} close={close} />
        <MediaEditorTabs tabs={test} />
      </div>
    </div>
  </div>
}
