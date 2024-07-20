import {EditorHeader} from './media-editor/editor-header';
import {MediaEditorGeneralSettings} from './media-editor/tabs/editor-general-settings';
import {createEffect, createSignal, onMount} from 'solid-js';
import {MediaEditorPaintSettings} from './media-editor/tabs/editor-paint-settings';
import {MediaEditorTextSettings} from './media-editor/tabs/editor-text-settings';
import {MediaEditorCropSettings} from './media-editor/tabs/editor-crop-settings';
import {createStore} from 'solid-js/store';
import {MediaEditorTabs} from './media-editor/editor-tabs';
import {MediaEditorStickersSettings} from './media-editor/tabs/editor-stickers-settings';
import rootScope from '../lib/rootScope';
import {MediaEditorStickersPanel} from './media-editor/media-panels/stickers-panel';
import {MediaEditorPaintPanel} from './media-editor/media-panels/paint-panel';
import {simplify} from './media-editor/media-panels/draw.util';
import {Stroke} from './media-editor/math/algo';
import {calcCDT, drawWideLineTriangle, executeEnhanceFilter, getHSVTexture} from './media-editor/glPrograms';

export interface MediaEditorSettings {
  crop: number;
  text: {
    color: number | string;
    align: number;
    outline: number;
    size: number;
    font: number;
  },
  paint: {
    size: number;
    tool: number;
    tools: (number | string)[]
  },
  filters: {
    enhance: number,
    brightness: number,
    contrast: number,
    saturation: number,
    warmth: number,
    fade: number,
    highlights: number,
    shadows: number,
    vignette: number,
    grain: number,
    sharpen: number
  }
}

const defaultEditorState = {
  crop: 0,
  text: {
    color: 0,
    align: 0,
    outline: 0,
    size: 24,
    font: 0
  },
  paint: {
    size: 15,
    tool: 0,
    tools: [0, 1, 2, 3]
  },
  filters: {
    enhance: 0,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    warmth: 0,
    fade: 0,
    highlights: 0,
    shadows: 0,
    vignette: 0,
    grain: 0,
    sharpen: 0
  }
};

// need state for undo-redo
// it wil contain actual draw data: filters, crop, stickers pos, text pos, paint pos

const dup1 = (nestedArray: number[]) => {
  let out: any[] = [];
  const outs: any[][] = [];
  nestedArray.forEach(x => {
    out.push(x);
    if(out.length === 2) {
      outs.push([...out]);
      out = [];
    }
  });
  return outs;
}

export const AppMediaEditor = ({imageBlobUrl, close} : { imageBlobUrl: string, close: (() => void) }) => {
  const [tab, setTab] = createSignal(0);
  const [mediaEditorState, updateState] = createStore<MediaEditorSettings>(defaultEditorState);

  let glCanvas: HTMLCanvasElement;
  let gl:  WebGLRenderingContext;

  let container: HTMLDivElement;
  let img: HTMLImageElement;
  const plz = new Image();

  onMount(() => {
    plz.src = 'assets/brush.png';

    img = new Image();
    img.src = imageBlobUrl;
    img.onload = async function() {
      // generateFakeGif(img);
      glCanvas.width = container.clientWidth;
      glCanvas.height = container.clientHeight;
      const sourceWidth = img.width;
      const sourceHeight = img.height;
      gl = glCanvas.getContext('webgl');
      // get hsv data
      const hsvBuffer = getHSVTexture(gl, this as any, sourceWidth, sourceHeight);
      // calculate CDT Data
      const cdtBuffer = calcCDT(hsvBuffer, sourceWidth, sourceHeight);
      // apply enhancing filter
      const enhanceProgram = executeEnhanceFilter(gl, sourceWidth, sourceHeight, hsvBuffer, cdtBuffer);
      setFN(() => (int: number) => {
        gl.uniform1f(gl.getUniformLocation(enhanceProgram, 'intensity'), int);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      });
    };
  });

  const [fn, setFN] = createSignal((ebn: number) => { });

  createEffect(() => {
    const en = mediaEditorState.filters.enhance;
    console.info(en);

    if(fn()) {
      fn()(en / 100);
    }
  });

  const [stickers, setStickers] = createSignal([]);

  const updatePos = (id: string, x: number, y: number) => {
    setStickers(list => list.map(sticker => sticker.id === id ? ({...sticker, x, y}) : sticker));
  };

  const stickerCLick = async(val: any, doc: any) => {
    const docId = await rootScope.managers.appDocsManager.getDoc(doc);
    docId && setStickers(prev => [...prev, {id: crypto.randomUUID(), docId, x: 0, y: 0}]);
  }

  const linesSignal = createSignal<number[][]>([]);
  const [lines2] = linesSignal;

  createEffect(() => {
    const lines22 = lines2();
    if(!gl) {
      return;
    }
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    lines22.forEach(ppp => {
      const llld = dup1(ppp);
      const lll = simplify(llld, 2);
      const stroke = Stroke({
        thickness: 50,
        join: 'bevel',
        miterLimit: 5
      })
      const {positions, cells} = stroke.build(lll) as { cells: [number, number, number][], positions: [number, number][] };
      const fin = [].concat(...[].concat(...cells).map(cell => {
        const [x, y] = positions[cell];
        return [2 * (x / container.clientWidth) - 1, 2 * (y / container.clientHeight)];
      }));
      drawWideLineTriangle(gl, glCanvas.width, glCanvas.height, fin);
    });
  })

  return <div class='media-editor' onClick={() => close()}>
    <div class='media-editor__container' onClick={ev => ev.stopImmediatePropagation()}>
      <div ref={container} class='media-editor__main-area' >
        <canvas class='main-canvas' ref={glCanvas} />
        <MediaEditorPaintPanel linesSignal={linesSignal} active={tab() === 3} state={mediaEditorState.paint} />
        <MediaEditorStickersPanel active={tab() === 4} stickers={stickers()} updatePos={updatePos} />
      </div>
      <div class='media-editor__settings'>
        <EditorHeader undo={null} redo={null} close={close} />
        <MediaEditorTabs tab={tab()} setTab={setTab} tabs={[
          <MediaEditorGeneralSettings state={mediaEditorState.filters} updateState={updateState} />,
          <MediaEditorCropSettings crop={mediaEditorState.crop} setCrop={val => updateState('crop', val)} />,
          <MediaEditorTextSettings state={mediaEditorState.text} updateState={updateState} />,
          <MediaEditorPaintSettings state={mediaEditorState.paint} updateState={updateState} />,
          <MediaEditorStickersSettings stickerCLick={stickerCLick} />
        ]} />
      </div>
    </div>
  </div>
}
