import {MediaEditorTabs} from './media-editor/editor-tabs';
import {EditorHeader} from './media-editor/editor-header';
import {MediaEditorGeneralSettings} from './media-editor/editor-general-settings';
import {createEffect, createSignal, onMount} from 'solid-js';

const vertexShaderSource = `
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
            /* float enhance(float value) {
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
            } */
            void main(void) {
                // vec4 texel = texture2D(sTexture, vTextureCoord);
                // gl_FragColor = vec4(1.0, 1.0, 1.0, 1,0);
                gl_FragColor = texture2D(sTexture, vTextureCoord) * texture2D(inputImageTexture2, vTextureCoord); // vec4(vTextureCoord, 1.0, 1.0);
                /* vec4 hsv = texel;
                hsv.y = min(1.0, hsv.y * 1.2);
                hsv.z = min(1.0, enhance(hsv.z) * 1.1);
                gl_FragColor = vec4(hsv_to_rgb(mix(texel.xyz, hsv.xyz, intensity)), texel.w); */
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

      const vertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
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

      console.log(texture);
      console.log(myImgElement);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this as any);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      // Set up inputImageTexture2 (assuming it's another image, you can change as needed)
      gl.bindTexture(gl.TEXTURE_2D, inputImageTexture2);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, myImgElement);
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
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(gl.getUniformLocation(shaderProgram, 'sTexture'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, inputImageTexture2);
        gl.uniform1i(gl.getUniformLocation(shaderProgram, 'inputImageTexture2'), 1);

        gl.uniform1f(gl.getUniformLocation(shaderProgram, 'intensity'), 1.0); // Adjust intensity as needed

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
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
