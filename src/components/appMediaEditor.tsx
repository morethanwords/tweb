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
import {dot, simplify} from './media-editor/math/draw.util';
import {Stroke} from './media-editor/math/algo';
import {calcCDT, drawWideLineTriangle, executeEnhanceFilter, getHSVTexture} from './media-editor/glPrograms';
import {CropResizePanel} from './media-editor/media-panels/crop-resize-panel';

export interface MediaEditorSettings {
  crop: number;
  angle: number;
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
  angle: 0,
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

interface Point {
  x: number;
  y: number;
}

function getExtremumPoints(points: Point[]): Point[] {
  const minX = Math.min(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));

  const maxX = Math.max(...points.map(point => point.x));
  const maxY = Math.max(...points.map(point => point.y));

  const topLeft = {x: minX, y: minY};
  const bottomRight = {x: maxX, y: maxY};
  return [
    topLeft,
    // {x: topLeft.x, y: bottomRight.y},
    // {x: bottomRight.x, y: topLeft.y},
    bottomRight
  ]
}

function rotatePoint(point: Point, center: Point, angle: number): Point {
  // Convert angle to radians
  const radians = angle * (Math.PI / 180);

  // Translate point back to origin
  const translatedX = point.x - center.x;
  const translatedY = point.y - center.y;

  // Rotate point
  const rotatedX = translatedX * Math.cos(radians) - translatedY * Math.sin(radians);
  const rotatedY = translatedX * Math.sin(radians) + translatedY * Math.cos(radians);

  // Translate point back to original location
  const newX = rotatedX + center.x;
  const newY = rotatedY + center.y;

  return {x: newX, y: newY};
}

function rotateRectangle(rectangle: Point[], center: Point, angle: number): Point[] {
  return rectangle.map(point => rotatePoint(point, center, angle));
}

function getRectangleCenter(rectangle: Point[]): Point {
  if(rectangle.length !== 4) {
    throw new Error('Rectangle must have exactly 4 points');
  }

  const sum = rectangle.reduce(
    (acc, point) => {
      return {x: acc.x + point.x, y: acc.y + point.y};
    },
    {x: 0, y: 0}
  );

  const centerX = sum.x / 4;
  const centerY = sum.y / 4;

  return {x: centerX, y: centerY};
}

function getRectangleAspectRatio(rectangle: Point[]): number {
  if(rectangle.length !== 4) {
    throw new Error('Rectangle must have exactly 4 points');
  }

  // Find the width and height
  const width = Math.abs(rectangle[1].x - rectangle[0].x);
  const height = Math.abs(rectangle[2].y - rectangle[1].y);

  // Calculate aspect ratio
  const aspectRatio = width / height;

  return aspectRatio;
}

function scalePoint(point: Point, origin: Point, scale: number): Point {
  // Translate point to origin
  const translatedX = point.x - origin.x;
  const translatedY = point.y - origin.y;

  // Scale point
  const scaledX = translatedX * scale;
  const scaledY = translatedY * scale;

  // Translate point back
  const newX = scaledX + origin.x;
  const newY = scaledY + origin.y;

  return {x: newX, y: newY};
}

function scaleRectangle(rectangle: Point[], origin: Point, scale: number): Point[] {
  return rectangle.map(point => scalePoint(point, origin, scale));
}

function getBoundingBox(points: Point[]): { min: Point; max: Point } {
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for(const point of points) {
    if(point.x < minX) minX = point.x;
    if(point.x > maxX) maxX = point.x;
    if(point.y < minY) minY = point.y;
    if(point.y > maxY) maxY = point.y;
  }

  return {min: {x: minX, y: minY}, max: {x: maxX, y: maxY}};
}

function calculateDistance(rect1: Point[], rect2: Point[]): number {
  const bbox1 = getBoundingBox(rect1);
  const bbox2 = getBoundingBox(rect2);

  const dx = Math.max(bbox1.min.x - bbox2.max.x, bbox2.min.x - bbox1.max.x, 0);
  const dy = Math.max(bbox1.min.y - bbox2.max.y, bbox2.min.y - bbox1.max.y, 0);

  return Math.sqrt(dx * dx + dy * dy);
}

//
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
      // TODO: store into framebuffer (for blur and erase)
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
  });

  const angle = () => cropResizeActive() ? mediaEditorState.angle : 0;

  const [rectangle, setRectangle] = createSignal([
    {x:0, y:0}, // top left
    {x:0, y:1},
    {x:1, y:0},
    {x:1, y:1}
  ]);

  // const centerPoint = () => getRectangleCenter(rectangle());

  // rotating here
  createEffect(() => {
    console.info(angle());
    if(angle() === 0) {
      setScl(1);
    }

    const originW = container.clientWidth;
    const originH = container.clientHeight;

    const currentRectangle = rectangle().map(point => ({x: point.x * originW, y: point.y * originH}));

    const centerPoint = getRectangleCenter(currentRectangle);
    console.info(centerPoint);

    const rotatedRectangle = rotateRectangle(currentRectangle, centerPoint, angle());

    const [topLeft, bottomRight] = getExtremumPoints(rotatedRectangle);
    console.info('bpund', topLeft, bottomRight);

    const extrWidth = (bottomRight.x - topLeft.x);
    const extrHeight = (bottomRight.y - topLeft.y);

    console.info('wh', extrWidth, extrHeight, originW, originH);

    // const scale = Math.max(extrWidth / originW, extrHeight / originH);
    const scale = Math.min(originW / extrWidth, originH / extrHeight);
    setScl(scale)
    // console.info('sca', extrWidth / originW, extrHeight / originH);
    console.info('sca', originW / extrWidth, originH / extrHeight);
    console.info('sca2', scale);


    console.info('sca', 2 - (extrWidth / originW), 2 - (extrHeight / originH));
    console.info('sca', 2 - (originW / extrWidth), 2 - (originH / extrHeight));
    console.info('sca2', 2 - scale);
    // setScl(1 - (scale - 1));
    // setScl(1 - scale + 1)
    return;

    const finalRectangle = [
      [currentRectangle[0], rotatedRectangle[0]],
      [currentRectangle[1], rotatedRectangle[1]],
      [currentRectangle[2], rotatedRectangle[2]],
      [currentRectangle[3], rotatedRectangle[3]]
    ];
    // add threshold
    const isOutside = finalRectangle[1]; // .find(([orig, point]) => point.x < 0 || point.x > originW || point.y < 0 || point.y > originH);
    console.info(rotatedRectangle);
    console.info(!!isOutside);
    console.info(isOutside);

    if(angle() === 0 || !isOutside) {
      setScl(1);
      return;
    }
    const [original, rotated] = isOutside;
    const xAbs = Math.abs(rotated.x);
    const yAbs = Math.abs(rotated.y);
    console.info('orig', original.x)
    console.info('orig', original.y)
    console.info('rot', rotated.x);
    console.info('rot', rotated.y);

    const scaleX = (originW - xAbs) / originW;
    const scaleY = (originH - yAbs) / originH;

    console.info('scX', scaleX);
    console.info('scY', scaleY);

    const scale2 = Math.max((originW - xAbs) / originW, (originH - yAbs) / originH);
    // const scale = Math.max((originW + xAbs) / originW, (originH + yAbs) / originH);

    // setScl(scale);
    // const dst = calculateDistance(rectangle(), rotatedRectangle);
    // console.info(dst);
    // setScl(1.0 - Math.abs(dst)); // scale - newTest
  });

  // rotating here

  const [scl, setScl] = createSignal(1);

  createEffect(() => console.info('secl', scl()));
  const cropResizeActive = () => tab() === 1;
  return <div class='media-editor' onClick={() => close()}>
    <div class='media-editor__container' onClick={ev => ev.stopImmediatePropagation()}>
      <div ref={container} class='media-editor__main-area'>
        <div class='main-canvas-container' style={{transform: `translate(${cropResizeActive() ? 10 : 0}%, ${cropResizeActive() ? 6.5 : 0}%) scale(${cropResizeActive() ? 0.8 : 1}, ${cropResizeActive() ? 0.8 : 1})`}}>
          <canvas style={{transform: `rotate(${angle()}deg) scale(${scl()})`}} class='main-canvas' ref={glCanvas} />
        </div>
        <CropResizePanel state={mediaEditorState.angle} updateState={updateState} active={cropResizeActive()} />
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
