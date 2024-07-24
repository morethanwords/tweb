import {MediaEditorSettings} from '../../appMediaEditor';
import {createEffect, createSignal, onMount, Setter, Signal} from 'solid-js';
import {simplify} from '../math/draw.util';
import {Stroke} from '../math/algo';
import {drawWideLineTriangle} from '../glPrograms';

interface Point {
  x: number;
  y: number;
}

function findAngle(A: Point, B: Point, C: Point) {
  var AB = Math.sqrt(Math.pow(B.x-A.x, 2)+ Math.pow(B.y-A.y, 2));
  var BC = Math.sqrt(Math.pow(B.x-C.x, 2)+ Math.pow(B.y-C.y, 2));
  var AC = Math.sqrt(Math.pow(C.x-A.x, 2)+ Math.pow(C.y-A.y, 2));
  return Math.acos((BC*BC+AB*AB-AC*AC)/(2*BC*AB));
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

export const MediaEditorPaintPanel = (props: { setPoints: Setter<any[]>, crop: [Point, Point], left: number, top: number, height: number, width: number, linesSignal: Signal<number[][]>, active: boolean, state: MediaEditorSettings['paint'] }) => {
  const [, setLines] = props.linesSignal;
  const [points, setPoints] = createSignal([]);
  const [drawing, setDrawing] = createSignal(false);
  const [canvasPos, setCanvasPos] = createSignal([0, 0]);
  let skip = 0;

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let currentLineGL:  WebGLRenderingContext;

  createEffect(() => {
    const llld = dup1(points());
    if(!currentLineGL) {
      return;
    }
    console.info('ddddd', llld);
    const lll = simplify(llld, 2);
    console.info('draw', lll);
    const stroke = Stroke({
      thickness: 25,
      join: 'bevel',
      miterLimit: 5
    })
    const {positions, cells} = stroke.build(lll) as { cells: [number, number, number][], positions: [number, number][] };
    const fin = [].concat(...[].concat(...cells).map(cell => {
      const [x, y] = positions[cell];

      // const scaleX = x / props.width;
      // const scaleY = y / props.height;

      /* const cropWidth = props.crop[1].x - props.crop[0].x;
      const cropHeight = props.crop[1].y - props.crop[0].y;

      const justCropX = props.crop[0].x + cropWidth * scaleX;
      const justCropY = props.crop[0].y + cropHeight * scaleY; */

      // fix corrdinate system convertion
      // console.info('xx 22222', scaleX, scaleY);

      // console.info('pos  22222', justCropX, justCropY);

      // console.info('point', x, y);

      // [x, y] = [justCropX / props.width, justCropY / props.height];
      // return [2 * scaleX - 1, 2 * scaleY];

      console.info('pp', x, y);

      return [x, y];
      // return [2 * (x / props.width) - 1, 2 * ((y + props.top) / props.height)];
    }));
    // drawWideLineTriangle(currentLineGL, props.width, props.height, fin);
  });

  onMount(() => {
    console.info('pr', props);
    canvas.width = props.width || container.clientWidth;
    canvas.height = props.height || container.clientHeight;
    currentLineGL = canvas.getContext('webgl');
    const {left, top} = canvas.getBoundingClientRect();
    setCanvasPos([left, top]);
  });

  createEffect(() => {
    console.info('pr', props);
    canvas.width = props.width || container.clientWidth;
    canvas.height = props.height || container.clientHeight;
  });

  const draw = (ev: MouseEvent) => {
    const next = {x: ev.clientX - (canvasPos()[0] + props.left), y: ev.clientY - (canvasPos()[1] + props.top)};
    // console.info('pp', next);
    if(!drawing()) {
      return;
    }
    skip += 1;
    if(skip < 2) {
      return;
    }
    skip = 0;
    if(points().length >= 4) {
      const prev = {x: points().at(-4), y: points().at(-3)};
      const curr = {x: points().at(-2), y: points().at(-1)};

      let angle = findAngle(prev, curr, next);
      angle = angle * 180 / Math.PI;
      if(isNaN(angle) || angle < 75) {
        setLines(lines => [...lines, points()]);
        setPoints([next.x, next.y]);
        props.setPoints([next.x, next.y]);
        return;
      }
    }
    setPoints(points => [...points, next.x, next.y]);
    props.setPoints(points => [...points, next.x, next.y]);
  }

  const finishDraw = () => {
    console.info('FINISH DRAW');
    setDrawing(false);
    setLines(lines => [...lines, points()]);
    setPoints([]);
    props.setPoints([]);
  }

  return <div ref={container} classList={{'media-paint-panel': true, 'media-editor-stickers-panel': true, 'disabled': !props.active}}>
    <canvas style={{'transform-origin': '0 0'}}
      onMouseUp={finishDraw}
      onMouseDown={() => setDrawing(true)}
      onMouseMove={draw} class='draw-canvas' ref={canvas}></canvas>
  </div>
}
