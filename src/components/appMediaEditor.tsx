import {EditorHeader} from './media-editor/editor-header';
import {MediaEditorGeneralSettings} from './media-editor/tabs/editor-general-settings';
import {createEffect, createSignal, onMount} from 'solid-js';
import {calcCDT, executeEnhanceFilter, getHSVTexture} from './media-editor/utils';
import {MediaEditorPaintSettings} from './media-editor/tabs/editor-paint-settings';
import {MediaEditorTextSettings} from './media-editor/tabs/editor-text-settings';
import {MediaEditorCropSettings} from './media-editor/tabs/editor-crop-settings';
import {createStore} from 'solid-js/store';
import {MediaEditorTabs} from './media-editor/editor-tabs';
import {MediaEditorStickersSettings} from './media-editor/tabs/editor-stickers-settings';
import rootScope from '../lib/rootScope';
import {EmoticonsDropdown} from './emoticonsDropdown';

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

// need state for undo-redo
// it wil contain actual draw data: filters, crop, stickers pos, text pos, paint pos

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

  createEffect(() => {
    const en = mediaEditorState.filters.enhance;
    console.info(en);

    if(fn()) {
      fn()(en / 100);
    }
  });

  const test = [
    <MediaEditorGeneralSettings state={mediaEditorState.filters} updateState={updateState} />,
    <MediaEditorCropSettings crop={mediaEditorState.crop} setCrop={val => updateState('crop', val)} />,
    <MediaEditorTextSettings state={mediaEditorState.text} updateState={updateState} />,
    <MediaEditorPaintSettings state={mediaEditorState.paint} updateState={updateState} />,
    <MediaEditorStickersSettings />
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
