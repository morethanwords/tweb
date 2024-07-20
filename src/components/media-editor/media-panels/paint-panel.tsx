import {MediaEditorSettings} from '../../appMediaEditor';
import {createEffect, createSignal, onMount, Signal} from 'solid-js';
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

export const MediaEditorPaintPanel = (props: { linesSignal: Signal<number[][]>, active: boolean, state: MediaEditorSettings['paint'] }) => {
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
    drawWideLineTriangle(currentLineGL, canvas.width, canvas.height, fin);
  });

  onMount(() => {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    currentLineGL = canvas.getContext('webgl');
    const {left, top} = canvas.getBoundingClientRect();
    setCanvasPos([left, top]);
  });

  const draw = (ev: MouseEvent) => {
    if(!drawing()) {
      return;
    }
    skip += 1;
    if(skip < 2) {
      return;
    }
    skip = 0;
    const next = {x: ev.pageX - canvasPos()[0], y: ev.pageY - canvasPos()[1]};
    if(points().length >= 4) {
      const prev = {x: points().at(-4), y: points().at(-3)};
      const curr = {x: points().at(-2), y: points().at(-1)};

      let angle = findAngle(prev, curr, next);
      angle = angle * 180 / Math.PI;
      if(isNaN(angle) || angle < 75) {
        setLines(lines => [...lines, points()]);
        setPoints([next.x, next.y]);
        return;
      }
    }
    setPoints(points => [...points, next.x, next.y]);
  }

  const finishDraw = () => {
    console.info('FINISH DRAW');
    setDrawing(false);
    setLines(lines => [...lines, points()]);
    setPoints([]);
  }

  return <div ref={container} onMouseUp={finishDraw} onMouseDown={() => setDrawing(true)} onMouseMove={draw} classList={{'media-editor-stickers-panel': true, 'disabled': !props.active}}>
    <canvas style={{'transform-origin': '0 0'}} class='draw-canvas' ref={canvas}></canvas>
  </div>
}
