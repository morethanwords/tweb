import {MediaEditorSettings} from '../../appMediaEditor';
import {createEffect, createSignal, onMount, Setter, Signal} from 'solid-js';

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

export const MediaEditorPaintPanel = (props: { setPoints: Setter<any[]>, crop: [Point, Point], left: number, top: number, height: number, width: number, linesSignal: Signal<{points: number[], size: number, color: string | number, tool: number}[]>, active: boolean, state: MediaEditorSettings['paint'] }) => {
  const [, setLines] = props.linesSignal;
  const [points, setPoints] = createSignal([]);
  const [drawing, setDrawing] = createSignal(false);
  const [canvasPos, setCanvasPos] = createSignal([0, 0]);
  let skip = 0;

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;

  onMount(() => {
    canvas.width = props.width || container.clientWidth;
    canvas.height = props.height || container.clientHeight;
    const {left, top} = canvas.getBoundingClientRect();
    setCanvasPos([left, top]);
  });

  createEffect(() => {
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
        setLines(lines => [...lines, {points: points(), size: props.state.size, tool: props.state.tool, color: hexColor()}]);
        setPoints([next.x, next.y]);
        props.setPoints([next.x, next.y]);
        return;
      }
    }
    setPoints(points => [...points, next.x, next.y]);
    props.setPoints(points => [...points, next.x, next.y]);
  }

  const colors = [
    '#FFFFFF',
    '#FE4438',
    '#FF8901',
    '#FFD60A',
    '#33C759',
    '#62E5E0',
    '#0A84FF',
    '#BD5CF3'
  ];
  const selectedColor = () => props.state.tools[props.state.tool];
  const hexColor = () => {
    const color = selectedColor();
    return typeof color === 'number' ? colors[color] : color;
  };

  const finishDraw = () => {
    console.info('FINISH DRAW');
    setDrawing(false);
    setLines(lines => [...lines, {points: points(), size: props.state.size, tool: props.state.tool, color: hexColor()}]);
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
