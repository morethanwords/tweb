import {EditorHeader} from './media-editor/editor-header';
import {MediaEditorGeneralSettings} from './media-editor/tabs/editor-general-settings';
import {createEffect, createSignal, onMount, Show, untrack} from 'solid-js';
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
  const cropResizeActive = () => tab() === 1;
  const [mediaEditorState, updateState] = createStore<MediaEditorSettings>(defaultEditorState);

  let glCanvas: HTMLCanvasElement;
  let gl:  WebGLRenderingContext;

  let container: HTMLDivElement;
  let img: HTMLImageElement;
  const plz = new Image();

  const [canvasSize, setCanvasSize] = createSignal([0, 0]);
  // crop area in real pixels of image
  const [cropArea, setCropArea] = createSignal([{x: 0, y: 0}, {x: 0, y:0}]);
  const [canvasScale, setCanvasScale] = createSignal(1);
  const [canvasPos, setCanvasPos] = createSignal([0, 0]);

  const cropScale = () => {
    const cropWidth = cropArea()[1].x - cropArea()[0].x;
    const cropHeight = cropArea()[1].y - cropArea()[0].y;
    const scaleX = container.clientWidth / cropWidth;
    const scaleY = container.clientHeight / cropHeight;
    return Math.min(scaleX, scaleY);
  };
  const viewCropOffset = () => {
    const cropWidth = cropArea()[1].x - cropArea()[0].x;
    const cropHeight = cropArea()[1].y - cropArea()[0].y;
    const scaledWidth = cropWidth * cropScale();
    const scaledHeight = cropHeight * cropScale();
    return [
      Math.max(0, container.clientWidth - scaledWidth),
      Math.max(0, container.clientHeight - scaledHeight)
    ];
  };
  const centerScaledCropOffset = () => {
    const x = cropArea()[0].x;
    const y = cropArea()[0].y;
    const [restX, restY] = viewCropOffset();
    return [x - restX / 2, y - restY / 2];
  }

  onMount(() => {
    plz.src = 'assets/brush.png';

    img = new Image();
    img.src = imageBlobUrl;
    img.onload = async function() {
      const scaleX = img.width / container.clientWidth;
      const scaleY = img.height / container.clientHeight;
      const scale = Math.max(scaleX, scaleY);
      setCanvasSize([img.width / scale, img.height / scale]);
      glCanvas.width = img.width / scale;
      glCanvas.height = img.height / scale;

      // generateFakeGif(img);

      setCropArea([
        {x: 0, y: 0},
        {x: img.width / scale, y: img.height / scale}
      ]);

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

  // rotate
  const angle = () => mediaEditorState.angle;
  const croppedAreaRectangle = () => [
    {x: cropArea()[0].x, y: cropArea()[0].y},
    {x: cropArea()[0].x, y: cropArea()[1].y},
    {x: cropArea()[1].x, y: cropArea()[0].y},
    {x: cropArea()[1].x, y: cropArea()[1].y}
  ];
  const croppedAreaCenterPoint = () => getRectangleCenter(croppedAreaRectangle());

  createEffect(() => {
    if(angle() === 0) {
      setCanvasScale(1);
      setCanvasPos([0, 0]);
      return;
    }
    const rotatedRectangle = rotateRectangle(croppedAreaRectangle(), croppedAreaCenterPoint(), -angle());
    const [topLeft, bottomRight] = getExtremumPoints(rotatedRectangle);

    const rotatedBBWidth = bottomRight.x - topLeft.x;
    const rotatedBBHeight = bottomRight.y - topLeft.y;
    const scaleX = rotatedBBWidth / canvasSize()[0];
    const scaleY = rotatedBBHeight / canvasSize()[1];

    const scale = Math.max(scaleX, scaleY);
    const scaledRectangle = scale > 1 ?
      scaleRectangle(rotatedRectangle, getRectangleCenter(rotatedRectangle), 1 / scale) :
      rotatedRectangle;
    setCanvasScale(Math.max(1, scale));

    const [scaledTopLeft, scaledBottomRight] = getExtremumPoints(scaledRectangle);

    if(scaledTopLeft.x < 0 || scaledTopLeft.y < 0) {
      const moveX = scaledTopLeft.x > 0 ? 0 : Math.abs(scaledTopLeft.x);
      const moveY = scaledTopLeft.y > 0 ? 0 : Math.abs(scaledTopLeft.y);
      setCanvasPos([moveX, moveY]);
    } else if(scaledBottomRight.x > canvasSize()[0] || scaledBottomRight.y > canvasSize()[1]) {
      const moveX = scaledBottomRight.x < canvasSize()[0] ? 0 : -Math.abs(scaledBottomRight.x - canvasSize()[0]);
      const moveY = scaledBottomRight.y < canvasSize()[1] ? 0 : -Math.abs(scaledBottomRight.y - canvasSize()[1]);
      setCanvasPos([moveX, moveY]); // these probably should be set later on btw
    }
  });

  const mainCanvasCropResizeStyle = () => ({transform: `translate(${cropResizeActive() ? 10 : 0}%, ${cropResizeActive() ? 6.5 : 0}%) scale(${cropResizeActive() ? 0.8 : 1})`});
  const canvasSizeStyle = () => ({'max-width': `${canvasSize()[0]}px`, 'max-height': `${canvasSize()[1]}px`, 'width': '100%', 'height': '100%'});
  // end rotate

  // crop
  const [currentHandlerDrag, setCurrentHandlerDrag] = createSignal<number>(null);
  const [initDragPos, setInitDragPos] = createSignal<[number, number]>([0, 0]);
  let parentSize = [0, 0];

  createEffect(() => console.info(initDragPos()));

  const [tempCropArea, setTempCropArea] = createSignal([]);
  createEffect(() => setTempCropArea(cropArea()));
  const handleDragStart = (ev: DragEvent, idx: number) => {
    setCurrentHandlerDrag(idx);
    const [x, y] = [ev.clientX, ev.clientY];
    const {width, height} = (ev.target as HTMLElement).parentElement.getBoundingClientRect();
    parentSize = [width, height];
    setInitDragPos([x, y]);
  }

  let skip = 0;
  let cropDebounce: any;
  const onDrag = (ev: DragEvent) => {
    skip += 1;
    if(skip < 25) {
      return;
    }
    skip = 0;
    const [cX, cY] = [ev.clientX, ev.clientY];
    const x = (cX - initDragPos()[0]);
    const y = (cY - initDragPos()[1]);
    const [width, height] = parentSize;
    const scaleX = x / (width); // percentage of how much we decrease the size
    const scaleY = y / (height);

    const cropWidth = cropArea()[1].x - cropArea()[0].x;
    const cropHeight = cropArea()[1].y - cropArea()[0].y;
    const cropX = scaleX * cropWidth;
    const cropY = scaleY * cropHeight;

    setTempCropArea(cropArea());
    if(currentHandlerDrag() === 0) {
      setTempCropArea(([topLeft, bottomRight]) => [{x: topLeft.x + cropX, y: topLeft.y + cropY}, bottomRight]);
    } else if(currentHandlerDrag() === 1) {
      setTempCropArea(([topLeft, bottomRight]) => [{x: topLeft.x, y: topLeft.y + cropY}, {x: bottomRight.x + cropX, y: bottomRight.y}]);
    } else if(currentHandlerDrag() === 2) {
      setTempCropArea(([topLeft, bottomRight]) => [{x: topLeft.x + cropX, y: topLeft.y}, {x: bottomRight.x, y: bottomRight.y + cropY}]);
    } else {
      setTempCropArea(([topLeft, bottomRight]) => [topLeft, {x: bottomRight.x + cropX, y: bottomRight.y + cropY}]);
    }
  }

  const handleDragEnd = () => {
    setCurrentHandlerDrag(null);
    parentSize = [0, 0];
    clearTimeout(cropDebounce);
    cropDebounce = setTimeout(() => {
      setCropArea(tempCropArea());
    }, 50);
  }

  createEffect(() => {
    console.info('butn', mediaEditorState.crop);
    const option = mediaEditorState.crop;
    if(option === 2) {
      setCropArea(([topLeft, bottomRight]) => {
        const cropWidth = bottomRight.x - topLeft.x;
        const cropHeight = bottomRight.y - topLeft.y;
        const squareSide = Math.min(cropWidth, cropHeight);
        return [
          {x: topLeft.x + (cropWidth - squareSide) / 2, y: topLeft.y + (cropHeight - squareSide) / 2},
          {x: topLeft.x + squareSide + (cropWidth - squareSide) / 2, y: topLeft.y + squareSide + (cropHeight - squareSide) / 2}
        ];
      });
    }
  });
  // end crop

  return <div class='media-editor' onClick={() => close()}>
    <div class='media-editor__container' onClick={ev => ev.stopImmediatePropagation()}>
      <div ref={container} class='media-editor__main-area'>
        <div class='main-canvas-container' style={mainCanvasCropResizeStyle()}>
          <div class='center-crop-area' style={{...canvasSizeStyle(), transform: `translate(${-centerScaledCropOffset()[0]}px, ${-centerScaledCropOffset()[1]}px)`}}>
            <div class='canvas-view-helper' style={{'transform-origin': `${cropArea()[0].x}px ${cropArea()[0].y}px`, 'transform': `scale(${cropScale()})`}}>
              <div class='canvas-elem' style={{
                ...canvasSizeStyle(),
                transform: `translate(${-canvasPos()[0]}px, ${-canvasPos()[1]}px)`,
                filter: cropResizeActive() ? 'brightness(50%)' : 'none'
              }}>
                <canvas class='main-canvas' ref={glCanvas} style={{
                  'transform': `rotate(${-angle()}deg) scale(${canvasScale()})`,
                  'transform-origin': `${croppedAreaCenterPoint().x + canvasPos()[0]}px ${croppedAreaCenterPoint().y + canvasPos()[1]}px`
                }} />
              </div>
              <div class='cropped-view-area' style={{
                'opacity': +cropResizeActive(),
                'top': `${cropArea()[0].y}px`,
                'left': `${cropArea()[0].x}px`,
                'width': '100%', 'height': '100%',
                'max-height': `${(cropArea()[1].y - cropArea()[0].y)}px`,
                'max-width': `${(cropArea()[1].x - cropArea()[0].x)}px`
              }}></div>
              <div class='canvas-crop-handlers'
                onDragEnter={onDrag}
                onDragOver={onDrag}
                onClick={ev => console.info(ev.clientX, ev.clientY)}
                style={{
                  'opacity': +cropResizeActive(),
                  'top': `${tempCropArea()[0].y}px`,
                  'left': `${tempCropArea()[0].x}px`,
                  'width': '100%', 'height': '100%',
                  'max-height': `${(tempCropArea()[1].y - tempCropArea()[0].y)}px`,
                  'max-width': `${(tempCropArea()[1].x - tempCropArea()[0].x)}px`
                }}
              >
                <div draggable={true} onDragStart={ev => handleDragStart(ev, 0)} onClick={ev => console.info(ev.clientX, ev.clientY)} onDragEnd={handleDragEnd} class='crop-handle top left'></div>
                <div draggable={true} onDragStart={ev => handleDragStart(ev, 1)} onClick={ev => console.info(ev.clientX, ev.clientY)} onDragEnd={handleDragEnd} class='crop-handle top right'></div>
                <div draggable={true} onDragStart={ev => handleDragStart(ev, 2)} onClick={ev => console.info(ev.clientX, ev.clientY)} onDragEnd={handleDragEnd} class='crop-handle bottom left'></div>
                <div draggable={true} onDragStart={ev => handleDragStart(ev, 3)} onClick={ev => console.info(ev.clientX, ev.clientY)} onDragEnd={handleDragEnd} class='crop-handle bottom right'></div>
              </div>
            </div>
          </div>
          <div class='canvas-hider' style={{left: '-1000px', top: '-1000px', bottom: '-1000px', width: `calc(1000px + ${viewCropOffset()[0] / 2}px)`, opacity: +!cropResizeActive()}}></div>
          <div class='canvas-hider' style={{right: '-1000px', top: '-1000px', bottom: '-1000px', width: `calc(1000px + ${viewCropOffset()[0] / 2}px)`, opacity: +!cropResizeActive()}}></div>
          <div class='canvas-hider' style={{left: '-1000px', right: '-1000px', bottom: '-1000px', height: `calc(1000px + ${viewCropOffset()[1] / 2}px)`, opacity: +!cropResizeActive()}}></div>
          <div class='canvas-hider' style={{left: '-1000px', right: '-1000px', top: '-1000px', height: `calc(1000px + ${viewCropOffset()[1] / 2}px)`, opacity: +!cropResizeActive()}}></div>
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
