import {MediaEditorTabs} from './media-editor/editor-tabs';
import {EditorHeader} from './media-editor/editor-header';
import {MediaEditorGeneralSettings} from './media-editor/editor-general-settings';
import {createEffect, createSignal, onMount} from 'solid-js';
import {calcCDT} from './media-editor/utils';

const vertexShaderSource = `
            attribute vec4 aVertexPosition;
            attribute vec2 aTextureCoord;
            varying vec2 vTextureCoord;
            void main(void) {
                gl_Position = aVertexPosition;
                vTextureCoord = aTextureCoord;
            }
        `;

const vertexShaderSourceFlip = `
            attribute vec4 aVertexPosition;
            attribute vec2 aTextureCoord;
            varying vec2 vTextureCoord;
            void main(void) {
                gl_Position = aVertexPosition;
                vTextureCoord = vec2(aTextureCoord.x, 1.0 - aTextureCoord.y);
            }
        `;

// Fragment shader source
const fragmentShaderSource = `
            precision highp float;
            varying vec2 vTextureCoord;
            uniform sampler2D sTexture;
            uniform sampler2D inputImageTexture2;
            uniform float intensity;
            
            float enhance(float value) {
                const vec2 offset = vec2(0.001953125, 0.03125);
                value = value + offset.x;
                vec2 coord = (clamp(vTextureCoord, 0.125, 1.0 - 0.125001) - 0.125) * 4.0;
                vec2 frac = fract(coord);
                coord = floor(coord);
                float p00 = float(coord.y * 4.0 + coord.x) * 0.0625 + offset.y;
                float p01 = float(coord.y * 4.0 + coord.x + 1.0) * 0.0625 + offset.y;
                float p10 = float((coord.y + 1.0) * 4.0 + coord.x) * 0.0625 + offset.y;
                float p11 = float((coord.y + 1.0) * 4.0 + coord.x + 1.0) * 0.0625 + offset.y;
                vec3 c00 = texture2D(inputImageTexture2, vec2(value, p00)).rgb;
                vec3 c01 = texture2D(inputImageTexture2, vec2(value, p01)).rgb;
                vec3 c10 = texture2D(inputImageTexture2, vec2(value, p10)).rgb;
                vec3 c11 = texture2D(inputImageTexture2, vec2(value, p11)).rgb;
                float c1 = ((c00.r - c00.g) / (c00.b - c00.g));
                float c2 = ((c01.r - c01.g) / (c01.b - c01.g));
                float c3 = ((c10.r - c10.g) / (c10.b - c10.g));
                float c4 = ((c11.r - c11.g) / (c11.b - c11.g));
                float c1_2 = mix(c1, c2, frac.x);
                float c3_4 = mix(c3, c4, frac.x);
                return mix(c1_2, c3_4, frac.y);
            } 
            vec3 hsv_to_rgb(vec3 c) {
                vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
            }
            void main(void) {
                vec4 texel = texture2D(sTexture, vTextureCoord);
                vec4 hsv = texel;
                hsv.y = min(1.0, hsv.y * 1.2);
                hsv.z = min(1.0, enhance(hsv.z) * 1.1);
                gl_FragColor = vec4(hsv_to_rgb(mix(texel.xyz, hsv.xyz, intensity)), texel.w);
                // gl_FragColor = texture2D(inputImageTexture2, vTextureCoord);
            }
        `;

const rgbToHsvFragmentShaderCode = `
  precision highp float;
  varying vec2 vTextureCoord;
  uniform sampler2D sTexture;
  
  vec3 rgb_to_hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = c.g < c.b ? vec4(c.bg, K.wz) : vec4(c.gb, K.xy);
      vec4 q = c.r < p.x ? vec4(p.xyw, c.r) : vec4(c.r, p.yzx);
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }
  
  void main() {
      vec4 texel = texture2D(sTexture, vTextureCoord);
      gl_FragColor = vec4(rgb_to_hsv(texel.rgb), texel.a);
  }
`;

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
  let canvas: HTMLCanvasElement;
  let glCanvas: HTMLCanvasElement;
  let context: CanvasRenderingContext2D;
  let gl:  WebGLRenderingContext;
  let myImgElement: HTMLImageElement;
  let container: HTMLDivElement;

  onMount(() => {
    const img = new Image();
    img.src = imageBlobUrl;
    img.onload = function() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = w;
      canvas.height = h;

      glCanvas.width = w;
      glCanvas.height = h;

      console.info('img', img.width, img.height);
      console.info('canvas', canvas.width, canvas.height);
      console.info('canvas GL', glCanvas.width, glCanvas.height);

      context = canvas.getContext('2d');
      context.drawImage(myImgElement, 0, 0, img.width, img.height, 0, 0, canvas.width, canvas.height);

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
      console.log(myImgElement);
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
        <div class='images small'>
          <img ref={myImgElement} src={imageBlobUrl} />
          <img src={imageBlobUrl} />
        </div>

        <div class='images'>
          <canvas ref={canvas} />
          <canvas class='gl-canvas' ref={glCanvas} />
        </div>

      </div>
      <div class='media-editor__settings'>
        <EditorHeader undo={null} redo={null} close={close} />
        <MediaEditorTabs tabs={test} />
      </div>
    </div>
  </div>
}
