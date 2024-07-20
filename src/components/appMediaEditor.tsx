import {EditorHeader} from './media-editor/editor-header';
import {MediaEditorGeneralSettings} from './media-editor/tabs/editor-general-settings';
import {createEffect, createSignal, onMount} from 'solid-js';
import {
  calcCDT,
  drawOpaqueTriangles,
  drawTextureDebug, drawTextureImageDebug, drawWideLine, drawWideLineTriangle,
  executeEnhanceFilter,
  executeLineDrawing,
  getHSVTexture
} from './media-editor/utils';
import {MediaEditorPaintSettings} from './media-editor/tabs/editor-paint-settings';
import {MediaEditorTextSettings} from './media-editor/tabs/editor-text-settings';
import {MediaEditorCropSettings} from './media-editor/tabs/editor-crop-settings';
import {createStore} from 'solid-js/store';
import {MediaEditorTabs} from './media-editor/editor-tabs';
import {MediaEditorStickersSettings} from './media-editor/tabs/editor-stickers-settings';
import rootScope from '../lib/rootScope';
import {MediaEditorStickersPanel} from './media-editor/media-panels/stickers-panel';
import {MediaEditorPaintPanel} from './media-editor/media-panels/paint-panel';
import {generateFakeGif} from './media-editor/generate/media-editor-generator';
import {polylineNormals, simplify} from './media-editor/media-panels/draw.util';
import {dup} from '../vendor/leemon';
import {Stroke} from './media-editor/media-panels/algo';

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

const duplicate2 = (nestedArray: number[], mirror = false) => {
  const out: any[] = []
  nestedArray.forEach(x => {
    out.push(mirror ? -x : x, x)
  })
  return out;
}

const duplicate3 = (nestedArray: number[]) => {
  let out: any[] = [];
  const outs: any[][] = [];
  nestedArray.forEach(x => {
    out.push(x);
    if(out.length === 2) {
      outs.push([...out]);
      out = [];
    }
  });
  const res: any[] = [];
  outs.forEach(oo => {
    res.push(oo);
    res.push(oo);
  });
  return res;
}

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

  /*
  let ca2: HTMLCanvasElement;
  let ctx2:  CanvasRenderingContext2D;
  let svgg: SVGElement;
  let helper: HTMLElement;

  async function createImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.decode = () => resolve(img) as any
      img.onload = () => resolve(img)
      img.onerror = reject
      img.crossOrigin = 'anonymous'
      img.decoding = 'async'
      img.src = url
    })
  }

  async function svgToDataURL(svg: SVGElement): Promise<string> {
    return Promise.resolve().then(() => new XMLSerializer().serializeToString(svg)).then(encodeURIComponent).then((html) => `data:image/svg+xml;charset=utf-8,${html}`)
  }

  async function nodeToDataURL(
    node: HTMLElement,
    width: number,
    height: number
  ): Promise<string> {
    const xmlns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(xmlns, 'svg')
    const foreignObject = document.createElementNS(xmlns, 'foreignObject')

    svg.setAttribute('width', `${width}`)
    svg.setAttribute('height', `${height}`)
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)

    foreignObject.setAttribute('width', '100%')
    foreignObject.setAttribute('height', '100%')
    foreignObject.setAttribute('x', '0')
    foreignObject.setAttribute('y', '0')
    foreignObject.setAttribute('externalResourcesRequired', 'true')

    svg.appendChild(foreignObject)
    foreignObject.appendChild(node)
    return svgToDataURL(svg)
  }
   */

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

      /*
      ca2.width = container.clientWidth / 2;
      ca2.height = container.clientHeight / 2;

      ctx2 = ca2.getContext('2d');
      ctx2.font = '60px Papyrus';
      ctx2.lineWidth = 5;
      ctx2.strokeText('Be sure to get that stuff', 10, 20);
      ctx2.fillText('Be sure to get that stuff', 10, 20);

      ctx2.lineWidth = 15;
      ctx2.fillText('Be sure to get that stuff', 60, 80);

      ctx2.font = '20px Avenir Next';
      ctx2.lineWidth = 15;
      ctx2.fillText('Be sure to get that stuff', 60, 160);

      if(svgg) {
        // ctx2.drawImage(img, 0, 0, ca2.width, ca2.height);

      } */

      // debug brush
      /* plz.onload = (l => {
        // const debugProgram = drawTextureImageDebug(gl, sourceWidth, sourceHeight, plz);

        const path = [[-0.5, 0], [0, 0.0], [0.5, 0.5], [-1.0, 0.5], [1.0, -1.0]];
        const rawNormals = polylineNormals(path, false);
        const normals = rawNormals.map(x => x[0]);
        const miters = rawNormals.map(x => x[1]);
        // console.info(normals);
        // console.info(miters);
        const lines = [].concat(...path.map((point, idx) => [...point, ...normals[idx], miters[idx]]));
        // console.info(lines);
        const res = [].concat(...path);

        const duplicate = duplicate2; // (val: any, ...args: any[]) => val;

        const points = [].concat(...duplicate3(res));
        const nrmls = [].concat(...duplicate3( [].concat(...normals)));
        const mtrs = duplicate([].concat(...miters), true);

        const textureCoordinates2 = [
          0.0,  1.0,
          1.0,  1.0,
          0.0,  0.0,
          1.0,  0.0,

          0.0,  1.0,
          1.0,  1.0,
          0.0,  0.0,
          1.0,  0.0,

          0.0,  1.0,
          1.0,  1.0
        ];

        drawWideLine(gl, sourceWidth, sourceHeight, points, nrmls, mtrs, textureCoordinates2, plz);
      }); */
      // const img
      return;

      // const path = [[0, 122], [0, 190], [90, 190]];
      const path = [[-0.5, 0], [0, 0.0], [0.5, 0.5], [-1.0, 0.5], [1.0, -1.0]];
      const rawNormals = polylineNormals(path, false);
      const normals = rawNormals.map(x => x[0]);
      const miters = rawNormals.map(x => x[1]);
      // console.info(normals);
      // console.info(miters);
      const lines = [].concat(...path.map((point, idx) => [...point, ...normals[idx], miters[idx]]));
      // console.info(lines);
      const res = [].concat(...path);

      const duplicate = duplicate2; // (val: any, ...args: any[]) => val;

      const points = [].concat(...duplicate3(res));
      const nrmls = [].concat(...duplicate3( [].concat(...normals)));
      const mtrs = duplicate([].concat(...miters), true);

      // drawWideLine(gl, sourceWidth, sourceHeight, points, nrmls, mtrs);

      return;
      const triangles = [
        // First triangle (semi-transparent red)
        -0.5, -0.5,
        0.5, -0.5,
        0.0,  0.5,

        // Second triangle (semi-transparent green)
        -0.5,  0.5,
        0.5,  0.5,
        0.0, -0.5,

        // Third triangle (semi-transparent blue)
        -0.75, 0.0,
        0.75, 0.0,
        0.0, 0.75
      ];
      drawOpaqueTriangles(gl, sourceWidth, sourceHeight, [0, 0, 0, 1, 0.5, 1]);

      return
      // LEAVE FOR TOMORROW CLEAR HEAD
      const linesTexture = executeLineDrawing(gl, sourceWidth, sourceHeight, [-1.0, -1.0, 0.5, 0.5, 0.0, 1.0, -0.5, 0.5, 1.0, -1.0]);

      console.info(linesTexture);
      console.info(linesTexture.filter(el => el > 0));

      const debugProgram = drawTextureDebug(gl, sourceWidth, sourceHeight, linesTexture);
      return;
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

  const [text, setText] = createSignal([
    'hello friend, how are you? \n fine shank you',
    'hello friend, how are you? \n fine shank you'
  ]);

  const linesSignal = createSignal<number[][]>([]);
  const [lines2, setLines] = linesSignal;

  /*
  createEffect(() => {
    // console.info('LINES', pointss());

    lines2()/* .map(len => len.map(dc => [dc[0] / 512, dc[1] / 824])).slice(0, 1) * /.forEach(ppp => {
      const path = dup1(ppp);
      // const path = simplify(path2, 0.005);
      console.info(path);
      const rawNormals = polylineNormals(path, false);
      const normals = rawNormals.map(x => x[0]);
      const miters = rawNormals.map(x => x[1]);

      const res = [].concat(...path);
      const points = [].concat(...duplicate3(res));
      const nrmls = [].concat(...duplicate3( [].concat(...normals)));
      const mtrs = duplicate2([].concat(...miters), true);

      const textureCoordinates2 = [].concat(...mtrs.map((_, idx) => {
        if(idx % 4 === 0) {
          return [0.0,  1.0];
        }
        if(idx % 4 === 1) {
          return [1.0,  1.0];
        }
        if(idx % 4 === 2) {
          return [0.0,  0.0];
        }
        return [1.0,  0.0];
      }));

      const colors = [].concat(...mtrs.map((_, idx) => {
        return [0.7,  0.2, 0.1];
      }));

      console.log(textureCoordinates2);
      console.log(colors);

      drawWideLine(gl, glCanvas.width, glCanvas.height, points, nrmls, mtrs, colors, textureCoordinates2, plz);
    });
  });

*/
  const drawLines = () => {
    let path = [];
    path = [[0.58145, 0.28252], [0.4681, 0.55193], [0.3878, 0.7048], [-1.0, 0.5], [1.0, -1.0]];
    path = [
      [527.703125, 316.796875],
      [500.703125, 300.796875],
      [345.703125, 290.796875],
      [327.703125, 275.796875]
      // [301.703125, 250.796875]
      // [301.703125, 336.796875]
    ];
    console.info(path);
    const rawNormals = polylineNormals(path, false);
    const normals = rawNormals.map(x => x[0]);
    const miters = rawNormals.map(x => x[1]);
    path = path.map(dc => [dc[0] / 900, dc[1] / 904]);
    // console.info(normals);
    // console.info(miters);
    const res = [].concat(...path);

    const duplicate = duplicate2; // (val: any, ...args: any[]) => val;

    const points = [].concat(...duplicate3(res));
    const nrmls = [].concat(...duplicate3( [].concat(...normals)));
    const mtrs = duplicate([].concat(...miters), true);

    const textureCoordinates2 = [
      0.0,  1.0,
      1.0,  1.0,
      0.0,  0.0,
      1.0,  0.0,

      0.0,  1.0,
      1.0,  1.0,
      0.0,  0.0,
      1.0,  0.0

      // 0.0,  1.0,
      // 1.0,  1.0
      // 0.0,  0.0,
      // 1.0,  0.0
    ];

    const colors = [
      1.0, 0.0, 0.0,
      1.0, 0.0, 0.0,
      1.0, 0.0, 0.0,

      0.0, 1.0, 0.0,
      0.0, 1.0, 0.0,
      0.0, 1.0, 0.0,

      0.0, 0.0, 1.0,
      0.0, 0.0, 1.0
      // 0.0, 0.0, 1.0,

      // 1.0, 1.0, 1.0
    ];

    console.log(textureCoordinates2);
    console.log(colors);

    drawWideLine(gl, glCanvas.width, glCanvas.height, points, nrmls, mtrs, colors, textureCoordinates2, plz);
  }

  const drawTriangleLines = () => {
    const polyline = [
      [527.703125, 316.796875],
      [500.703125, 300.796875],
      [345.703125, 290.796875],
      [327.703125, 275.796875],
      [301.703125, 250.796875],
      [301.703125, 336.796875]
    ];
    const stroke = Stroke({
      thickness: 50,
      cap: 'square',
      join: 'bevel',
      miterLimit: 10
    })
    const {positions} = stroke.build(polyline) as { cells: [number, number, number][], positions: [number, number][] };
    const fin = [].concat(...positions).map(val => val / 900);
    console.info(fin);
    drawWideLineTriangle(gl, glCanvas.width, glCanvas.height, fin);
  }

  createEffect(() => {
    console.info(lines2().length);
    if(!gl) {
      return;
    }
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    lines2().forEach(ppp => {
      const llld = dup1(ppp);
      const lll = simplify(llld, 2);
      // console.log(lll);
      const stroke = Stroke({
        thickness: 50,
        join: 'bevel',
        miterLimit: 5
      })
      const {positions, cells} = stroke.build(lll) as { cells: [number, number, number][], positions: [number, number][] };
      // console.info(positions);
      // console.info('cc', cells);
      const fin = [].concat(...[].concat(...cells).map(cell => positions[cell])).map(val => val / 900);
      // console.info(fin);
      drawWideLineTriangle(gl, glCanvas.width, glCanvas.height, fin);
    });
  })

  setTimeout(() => {
    // drawTriangleLines();
  }, 1000);

  return <div class='media-editor' onClick={() => close()}>
    <div class='media-editor__container' onClick={ev => ev.stopImmediatePropagation()}>
      <div ref={container} class='media-editor__main-area' >
        <canvas class='main-canvas' ref={glCanvas} />
        <MediaEditorPaintPanel linesSignal={linesSignal} active={tab() === 3} state={mediaEditorState.paint} />
        <MediaEditorStickersPanel active={tab() === 4} stickers={stickers()} updatePos={updatePos} />

        { /* <For each={text()}>
          { (text, idx) => <span class='media-editor-text'>{text}</span> }
        </For>
        <div class='text-helper'>
          <span class='media-editor-text test'>Be sure to wear flowers</span>
          <br />
          <span class='media-editor-text test'>in your hair</span>
        </div>
        <svg style="visibility: hidden; position: absolute;" width="0" height="0" xmlns="http://www.w3.org/2000/svg" version="1.1">
          <defs>
            <filter id="instagram">
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
              <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" result="goo" />
              <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
            </filter>
          </defs>
        </svg>

        <canvas class='ca2' ref={ca2} /> */ }
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
