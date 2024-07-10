import {MediaEditorTabs} from './media-editor/editor-tabs';
import {EditorHeader} from './media-editor/editor-header';
import {MediaEditorGeneralSettings} from './media-editor/editor-general-settings';
import {createEffect, createSignal, onMount} from 'solid-js';
import {calcCDT} from './media-editor/utils';
import {
  fragmentShaderSource,
  rgbToHsvFragmentShaderCode,
  vertexShaderSource,
  vertexShaderSourceFlip
} from './media-editor/shaders';

function compileShader(gl: WebGLRenderingContext, source: string, type: number) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

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
      const dataVertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
      const dataFragmentShader = compileShader(gl, rgbToHsvFragmentShaderCode, gl.FRAGMENT_SHADER);
      const dataShaderProgram = gl.createProgram();
      gl.attachShader(dataShaderProgram, dataVertexShader);
      gl.attachShader(dataShaderProgram, dataFragmentShader);
      gl.linkProgram(dataShaderProgram);

      if(!gl.getProgramParameter(dataShaderProgram, gl.LINK_STATUS)) {
        console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(dataShaderProgram));
      } else {
        console.log('WOWWOWOWOW');
      }

      gl.useProgram(dataShaderProgram);

      // textures
      const dataTexture = gl.createTexture();

      gl.bindTexture(gl.TEXTURE_2D, dataTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this as any);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);


      const targetTextureWidth = img.width;
      const targetTextureHeight = img.height;
      const targetTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, targetTexture);
      const level = 0;
      const internalFormat = gl.RGBA;
      const border = 0;
      const format = gl.RGBA;
      const type = gl.UNSIGNED_BYTE;
      const data: null = null;
      gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, targetTextureWidth, targetTextureHeight, border, format, type, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

      // attach the texture as the first color attachment
      const attachmentPoint = gl.COLOR_ATTACHMENT0;
      gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, targetTexture, level);
      //

      const dataPositionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, dataPositionBuffer);
      const dataPositions = [
        -1.0,  1.0,
        1.0,  1.0,
        -1.0, -1.0,
        1.0, -1.0
      ];
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dataPositions), gl.STATIC_DRAW);

      const dataTextureCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, dataTextureCoordBuffer);
      const dataTextureCoordinates = [
        0.0,  1.0,
        1.0,  1.0,
        0.0,  0.0,
        1.0,  0.0
      ];
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dataTextureCoordinates), gl.STATIC_DRAW);

      const dataVertexPosition = gl.getAttribLocation(dataShaderProgram, 'aVertexPosition');
      gl.enableVertexAttribArray(dataVertexPosition);
      gl.bindBuffer(gl.ARRAY_BUFFER, dataPositionBuffer);
      gl.vertexAttribPointer(dataVertexPosition, 2, gl.FLOAT, false, 0, 0);

      const dataTextureCoord = gl.getAttribLocation(dataShaderProgram, 'aTextureCoord');
      gl.enableVertexAttribArray(dataTextureCoord);
      gl.bindBuffer(gl.ARRAY_BUFFER, dataTextureCoordBuffer);
      gl.vertexAttribPointer(dataTextureCoord, 2, gl.FLOAT, false, 0, 0);
      // Render after both textures are loaded


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

      const vertexShader = compileShader(gl, vertexShaderSourceFlip, gl.VERTEX_SHADER);
      const fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
      const shaderProgram = gl.createProgram();
      gl.attachShader(shaderProgram, vertexShader);
      gl.attachShader(shaderProgram, fragmentShader);
      gl.linkProgram(shaderProgram);

      if(!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
      }

      gl.useProgram(shaderProgram);
      console.info('use shared', shaderProgram);

      // load textures here
      const texture = gl.createTexture();
      const inputImageTexture2 = gl.createTexture();

      const hsvBuffer = res;
      console.log(texture);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D (gl.TEXTURE_2D, 0, gl.RGBA, img.width, img.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, hsvBuffer);

      // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this as any);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      // Set up inputImageTexture2 (assuming it's another image, you can change as needed)
      const PGPhotoEnhanceHistogramBins = 256;
      const PGPhotoEnhanceSegments = 4;
      const renderBufferWidth = img.width;
      const renderBufferHeight = img.height;
      const cdtBuffer = new Uint8Array(PGPhotoEnhanceSegments * PGPhotoEnhanceSegments * PGPhotoEnhanceHistogramBins * 4);
      // const hsvBuffer = new Uint8Array(renderBufferWidth * renderBufferHeight * 4);

      calcCDT(hsvBuffer, renderBufferWidth, renderBufferHeight, cdtBuffer);

      console.log(hsvBuffer);
      console.log(cdtBuffer);

      gl.bindTexture(gl.TEXTURE_2D, inputImageTexture2);
      gl.texImage2D (gl.TEXTURE_2D, 0, gl.RGBA, 256, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, cdtBuffer);
      // gl.texImage2D (gl.TEXTURE_2D, 0, gl.RGBA, img.width, img.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, cdtBuffer);
      // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cdtBuffer);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      // load data
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      const positions = [
        -1.0,  1.0,
        1.0,  1.0,
        -1.0, -1.0,
        1.0, -1.0
      ];
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

      const textureCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
      const textureCoordinates = [
        0.0,  1.0,
        1.0,  1.0,
        0.0,  0.0,
        1.0,  0.0
      ];
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);

      const vertexPosition = gl.getAttribLocation(shaderProgram, 'aVertexPosition');
      gl.enableVertexAttribArray(vertexPosition);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(vertexPosition, 2, gl.FLOAT, false, 0, 0);

      const textureCoord = gl.getAttribLocation(shaderProgram, 'aTextureCoord');
      gl.enableVertexAttribArray(textureCoord);
      gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
      gl.vertexAttribPointer(textureCoord, 2, gl.FLOAT, false, 0, 0);
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
