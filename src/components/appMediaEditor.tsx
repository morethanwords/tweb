import {MediaEditorTabs} from './media-editor/editor-tabs';
import {EditorHeader} from './media-editor/editor-header';
import {MediaEditorGeneralSettings} from './media-editor/editor-general-settings';
import {createEffect, createSignal, onMount} from 'solid-js';
import {
  bindBufferToAttribute,
  calcCDT,
  createAndUseGLProgram, createGLBuffer,
  createGLTexture,
  positionCoordinates,
  textureCoordinates
} from './media-editor/utils';
import {
  fragmentShaderSource,
  rgbToHsvFragmentShaderCode,
  vertexShaderSource,
  vertexShaderSourceFlip
} from './media-editor/shaders';

export const AppMediaEditor = ({imageBlobUrl, close} : { imageBlobUrl: string, close: (() => void) }) => {
  let glCanvas: HTMLCanvasElement;
  let gl:  WebGLRenderingContext;
  let container: HTMLDivElement;

  onMount(() => {
    const img = new Image();
    img.src = imageBlobUrl;
    img.onload = function() {
      const w = container.clientWidth;
      const h = container.clientHeight;

      glCanvas.width = w;
      glCanvas.height = h;

      console.info('img', img.width, img.height);
      console.info('canvas GL', glCanvas.width, glCanvas.height);

      // open GL
      gl = glCanvas.getContext('webgl');

      // get hsv
      const dataShaderProgram = createAndUseGLProgram(gl, vertexShaderSource, rgbToHsvFragmentShaderCode);

      // textures
      const dataTexture = createGLTexture(gl);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this as any);


      const targetTextureWidth = img.width;
      const targetTextureHeight = img.height;
      const level = 0;
      const internalFormat = gl.RGBA;
      const border = 0;
      const format = gl.RGBA;
      const type = gl.UNSIGNED_BYTE;
      const data: null = null;

      const targetTexture = createGLTexture(gl);
      gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, targetTextureWidth, targetTextureHeight, border, format, type, data);

      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetTexture, level);

      const dataPositionBuffer = createGLBuffer(gl, new Float32Array(positionCoordinates));
      bindBufferToAttribute(gl, dataShaderProgram, 'aVertexPosition', dataPositionBuffer);
      const dataTextureCoordBuffer = createGLBuffer(gl, new Float32Array(textureCoordinates));
      bindBufferToAttribute(gl, dataShaderProgram, 'aTextureCoord', dataTextureCoordBuffer);


      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.viewport(0, 0, targetTextureWidth, targetTextureHeight);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, dataTexture);
      gl.uniform1i(gl.getUniformLocation(dataShaderProgram, 'sTexture'), 0);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      const res = new Uint8Array(targetTextureWidth * targetTextureHeight * 4);
      gl.readPixels(0, 0, targetTextureWidth, targetTextureHeight, gl.RGBA, gl.UNSIGNED_BYTE, res);
      console.log('really this:?', res);

      // RENDER MAIN
      // RENDER MAIN
      // RENDER MAIN

      const shaderProgram = createAndUseGLProgram(gl, vertexShaderSourceFlip, fragmentShaderSource);
      console.info('use shared', shaderProgram);

      // load textures here
      const hsvBuffer = res;

      const texture = createGLTexture(gl);
      gl.texImage2D (gl.TEXTURE_2D, 0, gl.RGBA, img.width, img.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, hsvBuffer);

      // Set up inputImageTexture2 (assuming it's another image, you can change as needed)
      const PGPhotoEnhanceHistogramBins = 256;
      const PGPhotoEnhanceSegments = 4;
      const renderBufferWidth = img.width;
      const renderBufferHeight = img.height;
      const cdtBuffer = new Uint8Array(PGPhotoEnhanceSegments * PGPhotoEnhanceSegments * PGPhotoEnhanceHistogramBins * 4);
      calcCDT(hsvBuffer, renderBufferWidth, renderBufferHeight, cdtBuffer);

      console.log(hsvBuffer);
      console.log(cdtBuffer);

      const inputImageTexture2 = createGLTexture(gl);
      gl.texImage2D (gl.TEXTURE_2D, 0, gl.RGBA, 256, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, cdtBuffer);

      // load data
      const positionBuffer = createGLBuffer(gl, new Float32Array(positionCoordinates));
      bindBufferToAttribute(gl, shaderProgram, 'aVertexPosition', positionBuffer);
      const textureCoordBuffer = createGLBuffer(gl, new Float32Array(textureCoordinates));
      bindBufferToAttribute(gl, shaderProgram, 'aTextureCoord', textureCoordBuffer);

      // Render after both textures are loaded
      render();

      function render() {
        console.info('start redner');
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Tell WebGL how to convert from clip space to pixels
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(gl.getUniformLocation(shaderProgram, 'sTexture'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, inputImageTexture2);
        gl.uniform1i(gl.getUniformLocation(shaderProgram, 'inputImageTexture2'), 1);

        const intencity = -1.0;
        gl.uniform1f(gl.getUniformLocation(shaderProgram, 'intensity'), intencity); // Adjust intensity as needed

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        setFN(() => (int: number) => {
          console.log('???????');
          gl.uniform1f(gl.getUniformLocation(shaderProgram, 'intensity'), int); // Adjust intensity as needed
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        });

        /* setInterval(() => {
          console.log(':(');
          intencity += 0.05;
          gl.uniform1f(gl.getUniformLocation(shaderProgram, 'intensity'), intencity); // Adjust intensity as needed
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }, 1000); */
      }
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
    <span>Tab 1</span>,
    <span>Tab 2</span>,
    <span>Tab 3</span>,
    <span>Tab 4</span>
  ];

  return <div class='media-editor' onClick={() => close()}>
    <div class='media-editor__container' onClick={ev => ev.stopImmediatePropagation()}>
      <div ref={container} class='media-editor__main-area'>
        <canvas class='gl-canvas' ref={glCanvas} />

      </div>
      <div class='media-editor__settings'>
        <EditorHeader undo={null} redo={null} close={close} />
        <MediaEditorTabs tabs={test} />
      </div>
    </div>
  </div>
}
