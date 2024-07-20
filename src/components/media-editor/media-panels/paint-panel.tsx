import {MediaEditorSettings} from '../../appMediaEditor';
import {createEffect, createSignal, onMount, Signal} from 'solid-js';
import {curve} from './draw.util';

interface Point {
  x: number;
  y: number;
}

export const MediaEditorPaintPanel = (props: { linesSignal: Signal<number[][]>, active: boolean, state: MediaEditorSettings['paint'] }) => {
  const [lines, setLines] = props.linesSignal;
  const [points, setPoints] = createSignal([]);
  const [drawing, setDrawing] = createSignal(false);
  const [canvasPos, setCanvasPos] = createSignal([0, 0]);
  let skip = 0;
  const skipN = 5;

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  onMount(() => {
    canvas.width = 512;
    canvas.height = 824;
    const {left, top} = canvas.getBoundingClientRect();
    setCanvasPos([left, top]);
    ctx = canvas.getContext('2d');
    ctx.strokeStyle = 'red';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 20;

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
    ctx.moveTo(points()[0], points()[1]);
    for(let i = 0, l = points().length; i < l; i += 2)
      ctx.lineTo(points()[i], points()[i+1]);
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
      if(skip > -1) {
        skip = 0;
        setPoints(points => [...points, 2 * (ev.pageX - canvasPos()[0]), 2 * (ev.pageY - canvasPos()[1])]);
        setLines(lines => [...lines.slice(0, lines.length - 2), points()]);
      }
    }
  }

  const finishDraw = () => {
    console.info('FINISH DRAW');
    setDrawing(false);
    setLines(lines => [...lines.slice(0, lines.length - 2), points()]);
    setPoints([]);

    // ctx.filter = 'blur(16px)';
  }

  return <div onMouseUp={finishDraw} onMouseDown={() => setDrawing(true)} onMouseMove={draw} classList={{'media-editor-stickers-panel': true, 'disabled': !props.active}}>
    <canvas style={{'transform-origin': '0 0'}} class='draw-canvas' ref={canvas}></canvas>
  </div>
}
