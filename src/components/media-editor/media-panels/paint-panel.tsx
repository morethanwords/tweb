import {MediaEditorSettings} from '../../appMediaEditor';
import {createEffect, createSignal, onMount, Signal} from 'solid-js';
import {curve, simplify} from './draw.util';
import {Stroke} from './algo';
import {drawWideLineTriangle} from '../utils';

interface Point {
  x: number;
  y: number;
}

function find_angle(A: Point, B: Point, C: Point) {
  /* console.info(A);
  console.info(B);
  console.info(C); */
  var AB = Math.sqrt(Math.pow(B.x-A.x, 2)+ Math.pow(B.y-A.y, 2));
  var BC = Math.sqrt(Math.pow(B.x-C.x, 2)+ Math.pow(B.y-C.y, 2));
  var AC = Math.sqrt(Math.pow(C.x-A.x, 2)+ Math.pow(C.y-A.y, 2));
  return Math.acos((BC*BC+AB*AB-AC*AC)/(2*BC*AB));
}

/* function calculateAngles(points: Point[]): number[] {
  const angles: number[] = [];

  for(let i = 1; i < points.length - 1; i++) {
    let angle = find_angle(points[i - 1], points[i], points[i + 1]);
    angle = angle * 180 / Math.PI;
    angles.push(angle);
  }

  return angles;
} */


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
  const [lines, setLines] = props.linesSignal;
  const [points, setPoints] = createSignal([]);
  const [drawing, setDrawing] = createSignal(false);
  const [canvasPos, setCanvasPos] = createSignal([0, 0]);
  let skip = 0;
  const skipN = 5;

  let canvas: HTMLCanvasElement;
  let currentLineGL:  WebGLRenderingContext;

  createEffect(() => {
    console.info('???????');
    console.info(points());
    if(!currentLineGL) {
      return;
    }
    const llld = dup1(points());
    console.info(llld);
    const lll = simplify(llld, 2);
    const stroke = Stroke({
      thickness: 50,
      join: 'bevel',
      miterLimit: 5
    })
    const {positions, cells} = stroke.build(lll) as { cells: [number, number, number][], positions: [number, number][] };
    // console.info(positions);
    // console.info('cc', cells);
    const fin = [].concat(...[].concat(...cells).map(cell => positions[cell])).map(val => val / 650);
    // console.info(fin);

    /* currentLineGL.clearColor(1.0, 1.0, 1.0, 1.0);
    currentLineGL.clear(currentLineGL.COLOR_BUFFER_BIT);
    currentLineGL.viewport(0, 0, currentLineGL.canvas.width, currentLineGL.canvas.height); */
    drawWideLineTriangle(currentLineGL, canvas.width, canvas.height, fin);
  });

  onMount(() => {
    canvas.width = 512;
    canvas.height = 824;
    currentLineGL = canvas.getContext('webgl');
    const {left, top} = canvas.getBoundingClientRect();
    setCanvasPos([left, top]);
    /* ctx = canvas.getContext('2d');
    ctx.strokeStyle = 'red';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 20; */

    // ctx.shadowBlur = 10;
    // ctx.shadowColor = 'yellow';
  });

  /* createEffect(() => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    lines().forEach(line => {
      ctx.moveTo(line[0], line[1]);
      for(let i = 0, l = line.length; i < l; i += 2)
        ctx.lineTo(line[i], line[i+1]);
      ctx.stroke();
    });
  }); */

  createEffect((prevPoints: number[]) => {
    // ctx.clearRect(0, 0, canvas.width, canvas.height)
    // ctx.moveTo(points()[0], points()[1]);
    // for(let i = 0, l = points().length; i < l; i += 2)
    // ctx.lineTo(points()[i], points()[i+1]);
    // const res = curve(ctx, after, 0.5, 10);
    //
    //
    // ctx.stroke();
    /* if(prevPoints.length) {

    } else {

    } */
    /* console.info(prevPoints.length);
    const after = points().slice(prevPoints.length);

    console.info(after);
    // draw only the new ones
    // ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.moveTo(after[0], after[1]);  // optionally move to first point
    ctx.lineTo(after[1], after[]);
    // const res = curve(ctx, after, 0.5, 10);
    ctx.stroke();
    */
    return points();
  }, points());

  // skip N
  const draw = (ev: MouseEvent) => {
    if(drawing()) {
      skip += 1;
      if(skip > 3) {
        skip = 0;

        if(points().length >= 4) {
          const prev = {x: points().at(-4), y: points().at(-3)};
          const curr = {x: points().at(-2), y: points().at(-1)};
          let angle = find_angle(prev, curr, {x: ev.pageX - canvasPos()[0], y: ev.pageY - canvasPos()[1]});
          angle = angle * 180 / Math.PI;
          // console.info('ANGLE', angle);

          if(isNaN(angle) || angle < 75) {
            setLines(lines => [...lines, points()]);
            setPoints([(ev.pageX - canvasPos()[0]), (ev.pageY - canvasPos()[1])]);
          } else {
            setPoints(points => [...points, (ev.pageX - canvasPos()[0]), (ev.pageY - canvasPos()[1])]);
          }
          // setLines(lines => [...lines, points()]);
          //
          // setPoints();
        } else {
          setPoints(points => [...points, (ev.pageX - canvasPos()[0]), (ev.pageY - canvasPos()[1])]);
        }
        // get current point and get last 2 points (if any)
        // check angle
        // if angle very sharp -> setLines with current lines (on top, not replace)
        // setLines(lines => [...lines.slice(0, lines.length - 2), points()]);
      }
    }
  }

  const finishDraw = () => {
    console.info('FINISH DRAW');
    setDrawing(false);
    setLines(lines => [...lines, points()]);
    // setLines(lines => [...lines.slice(0, lines.length - 2), points()]);
    setPoints([]);

    // ctx.filter = 'blur(16px)';
  }

  return <div onMouseUp={finishDraw} onMouseDown={() => setDrawing(true)} onMouseMove={draw} classList={{'media-editor-stickers-panel': true, 'disabled': !props.active}}>
    <canvas style={{'transform-origin': '0 0'}} class='draw-canvas' ref={canvas}></canvas>
  </div>
}
