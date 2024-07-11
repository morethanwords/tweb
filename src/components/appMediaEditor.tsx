import {MediaEditorTabs} from './media-editor/editor-tabs';
import {EditorHeader} from './media-editor/editor-header';
import {MediaEditorGeneralSettings} from './media-editor/tabs/editor-general-settings';
import {createEffect, createSelector, createSignal, onMount} from 'solid-js';
import {calcCDT, executeEnhanceFilter, genStateUpdater, getHSVTexture} from './media-editor/utils';
import {MediaEditorPaintSettings} from './media-editor/tabs/editor-paint-settings';
import {MediaEditorTextSettings} from './media-editor/tabs/editor-text-settings';
import {MediaEditorCropSettings} from './media-editor/tabs/editor-crop-settings';
import {createStore, StoreSetter, unwrap} from 'solid-js/store';


export interface MediaEditorState {
  crop: number;
  text: {
    color: number | string;
    align: number;
    outline: number;
    size: number;
    font: number;
  }
}

export const AppMediaEditor = ({imageBlobUrl, close} : { imageBlobUrl: string, close: (() => void) }) => {
  const [mediaEditorState, updateState] = createStore<MediaEditorState>({
    crop: 0,
    text: {
      color: 0,
      align: 0,
      outline: 0,
      size: 20,
      font: 0
    }
  });

  createEffect(() => {
    console.info(unwrap(mediaEditorState));
    console.info(mediaEditorState.crop);
  });

  createEffect(() => console.info('outline', mediaEditorState.text.outline));
  createEffect(() => console.info('align', mediaEditorState.text.align));
  createEffect(() => console.info('color', mediaEditorState.text.color));
  createEffect(() => console.info('size', mediaEditorState.text.size));
  createEffect(() => console.info('font', mediaEditorState.text.font));

  setTimeout(() => {
    updateState('text', 'size', 5);
  }, 5000);

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
    <MediaEditorPaintSettings />,
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
