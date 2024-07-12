import {MediaEditorTabs} from './media-editor/editor-tabs';
import {EditorHeader} from './media-editor/editor-header';
import {MediaEditorGeneralSettings} from './media-editor/tabs/editor-general-settings';
import {createEffect, createSelector, createSignal, onMount} from 'solid-js';
import {calcCDT, executeEnhanceFilter, genStateUpdater, getHSVTexture} from './media-editor/utils';
import {MediaEditorPaintSettings} from './media-editor/tabs/editor-paint-settings';
import {MediaEditorTextSettings} from './media-editor/tabs/editor-text-settings';
import {MediaEditorCropSettings} from './media-editor/tabs/editor-crop-settings';
import {createStore, StoreSetter, unwrap} from 'solid-js/store';

// only for drawing, not
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
  // stickers -> probably not here
  // text -> probably net here
}

export const AppMediaEditor = ({imageBlobUrl, close} : { imageBlobUrl: string, close: (() => void) }) => {
  const [mediaEditorState, updateState] = createStore<MediaEditorSettings>({
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
  });

  createEffect(() => console.info('tools 0', mediaEditorState.filters.enhance));
  createEffect(() => console.info('tools 1', mediaEditorState.paint.tools[1]));
  createEffect(() => console.info('tools 2', mediaEditorState.paint.tools[2]));
  createEffect(() => console.info('tools 3', mediaEditorState.paint.tools[3]));
  createEffect(() => console.info('size', mediaEditorState.paint.size));
  createEffect(() => console.info('tool', mediaEditorState.paint.tool));

  let glCanvas: HTMLCanvasElement;
  let gl:  WebGLRenderingContext;
  let container: HTMLDivElement;

  onMount(() => {
    const img = new Image();
    img.src = imageBlobUrl;
    img.onload = function() {
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

  const [data, setData] = createSignal();

  createEffect(() => {
    const en = (data() as any)?.['enhance'];
    console.info(en);

    if(fn()) {
      fn()(en / 100);
    }
  });

  const test = [
    <MediaEditorGeneralSettings change={val => setData(val)} />,
    <MediaEditorCropSettings crop={mediaEditorState.crop} setCrop={val => updateState('crop', val)} />,
    <MediaEditorTextSettings state={mediaEditorState.text} updateState={updateState} />,
    <MediaEditorPaintSettings state={mediaEditorState.paint} updateState={updateState} />,
    <span>Tab 4</span>
  ];

  return <div class='media-editor' onClick={() => close()}>
    <div class='media-editor__container' onClick={ev => ev.stopImmediatePropagation()}>
      <div ref={container} class='media-editor__main-area'>
        <canvas ref={glCanvas} />
      </div>
      <div class='media-editor__settings'>
        <EditorHeader undo={null} redo={null} close={close} />
        <MediaEditorTabs tabs={test} />
      </div>
    </div>
  </div>
}
