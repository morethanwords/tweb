import {createEffect, createSignal, Index, onMount, Show} from 'solid-js';
import wrapSticker from '../../wrappers/sticker';
import rootScope from '../../../lib/rootScope';
import {TextRenderer} from './text-renderer';

export interface TextData {
  id: string;
  text: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;

  color: number | string;
  align: number;
  outline: number;
  size: number;
  font: number;
}

interface Point {
  x: number;
  y: number;
}

function getAngle(pointA: Point, pointB: Point, pointC: Point) {
  const vectorAB = {x: pointA.x - pointB.x, y: pointA.y - pointB.y};
  const vectorBC = {x: pointC.x - pointB.x, y: pointC.y - pointB.y};
  const dotProduct = vectorAB.x * vectorBC.x + vectorAB.y * vectorBC.y;
  const magnitudeAB = Math.sqrt(vectorAB.x * vectorAB.x + vectorAB.y * vectorAB.y);
  const magnitudeBC = Math.sqrt(vectorBC.x * vectorBC.x + vectorBC.y * vectorBC.y);
  const cosTheta = dotProduct / (magnitudeAB * magnitudeBC);
  const angleRad = Math.acos(cosTheta);
  const angleDeg = angleRad * (180 / Math.PI);
  const crossProduct = vectorAB.x * vectorBC.y - vectorAB.y * vectorBC.x;
  return crossProduct > 0 ? angleDeg : -angleDeg;
}

const lessThanThreshold = (val1: number, val2: number, delta = 0.001) => {
  return Math.abs(val1 - val2) < delta;
}

const getDistance = (A: Point, B: Point) => {
  const a = A.x - B.x;
  const b = A.y - B.y;
  return Math.sqrt( a*a + b*b );
}

const MediaEditorText = (props: {
  startDrag: (data: any) => void,
  endDrag: () => void,
  upd: (p: Point) => Point,
  crop: [Point, Point],
  left: number,
  top: number,
  height: number,
  width: number,
  resize: boolean,
  textData: TextData,
  setResize: (val: boolean) => void,
  containerPos: [number, number],
  updatePos: (x: number, y: number, rotation: number, scale: number) => void,
  x: number, y: number, rotation: number, scale: number,
  dragPos: [number, number],
  handlerDragPos: [number, number],
  setHandlerDragPos: (val: [number, number]) => void,
  selected: boolean,
  select: (ev?: MouseEvent) => void }
) => {
  let element: HTMLDivElement;
  const [dragging, setDragging] = createSignal(false);
  const [initDragPos, setInitDragPos] = createSignal([0, 0]);
  const [initScale, setInitScale] = createSignal(0);
  const [initHandleDragPos, setInitHandleDragPos] = createSignal([0, 0]);
  const [scale, setScale] = createSignal(1);
  const [scalePos, setScalePos] = createSignal([0, 0]);
  const img = new Image();
  const [rot, setRot] = createSignal(0);
  const propsXY = () => ({x: props.x, y: props.y});
  let originalCenter = [0, 0];

  createEffect(() => {
    if(props.resize) {
      const origin = {x: initHandleDragPos()[0], y: initHandleDragPos()[1]};
      const target = {x: props.handlerDragPos[0], y: props.handlerDragPos[1]};

      const dir = [origin.x - originalCenter[0], origin.y - originalCenter[1]];
      const farPoint = {x:originalCenter[0] - dir[0], y: originalCenter[1] - dir[1]};

      const newPos = [(farPoint.x + target.x) / 2, (farPoint.y + target.y) / 2]
      const newSLen = getDistance(farPoint, target);

      setScalePos(newPos);
      setScale((newSLen / 2) / initScale());
      if(lessThanThreshold(origin.x, target.x) && lessThanThreshold(origin.y, target.y)) {
        return setRot(0);
      }
      const angle = getAngle(origin, farPoint, target); // mb use new origin bro
      setRot(-angle);
    }
  });

  const styles = () => props.selected && dragging() && props.dragPos.some(Boolean) ? [props.dragPos[0] - initDragPos()[0], props.dragPos[1] - initDragPos()[1]] : [propsXY().x, propsXY().y];
  const appRotation = () => props.selected && props.resize && props.handlerDragPos.some(Boolean) ? props.rotation - rot() : props.rotation;
  const appScale = () => props.selected && props.resize && props.handlerDragPos.some(Boolean) ? props.scale * scale() : props.scale;
  const appScalePos = () => props.selected && props.resize && props.handlerDragPos.some(Boolean) ? scalePos() : [propsXY().x, propsXY().y];
  const posss = () => props.resize ? appScalePos() : styles();

  onMount(async() => {
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
  });

  const onDragStart = (ev: DragEvent) => {
    props.startDrag({x: props.x, y: props.y, rotation: props.rotation, scale: props.scale}); // rotation scale too
    ev.dataTransfer.setDragImage(img, 0, 0);
    setDragging(true);
    props.select();

    const {pageX, pageY} = ev;
    const x = pageX - props.left;
    const y = pageY - props.top;
    const res = props.upd({x, y});
    setInitDragPos([res.x - propsXY().x, res.y - propsXY().y]);
  };

  const onDragEnd = () => {
    setDragging(false);
    props.updatePos(props.dragPos[0] - initDragPos()[0], props.dragPos[1] - initDragPos()[1], props.rotation, props.scale);
    props.endDrag();
  }

  const handleDragStart = (ev: DragEvent, idx: number) => {
    props.startDrag({x: props.x, y: props.y, rotation: props.rotation, scale: props.scale}); // rotation scale too
    ev.stopImmediatePropagation();
    props.select();
    const {pageX, pageY} = ev;
    const x = pageX - props.left;
    const y = pageY - props.top;
    const res = props.upd({x, y});
    originalCenter = [props.x, props.y];
    setInitHandleDragPos([res.x, res.y]);
    props.setHandlerDragPos([res.x, res.y]);
    const dist = getDistance({x: props.x, y: props.y}, {x:res.x, y: res.y});
    setInitScale(dist);
    props.setResize(true);
  }

  const handleDragEnd = (ev: DragEvent) => {
    props.setResize(false);
    ev.stopImmediatePropagation();
    props.updatePos(scalePos()[0], scalePos()[1], props.rotation - rot(), props.scale * scale());
    props.endDrag(); // rename to commit or smth

    props.setHandlerDragPos([0, 0]);
    setInitHandleDragPos([0, 0]);
  }

  const [textSize, setTextSize] = createSignal([0, 0]);

  return <div draggable={true} onDragStart={onDragStart} onDragEnd={onDragEnd}
    onClick={props.select} classList={{'media-editor-placed-sticker': true, 'text': true, 'selected': props.selected}}
    style={{
      'width': `${appScale() * textSize()[0]}px`,
      'height': `${appScale() * textSize()[1]}px`,
      'transform': `translate(${Math.round(posss()[0])}px, ${Math.round(posss()[1])}px) rotate(${appRotation()}deg)`,
      'transform-origin': '0 0'
    }}>
    <div style={{
      'transform': `translate(-50%, -50%)`,
      'transform-origin': '0 0',
      'width': `${appScale() * textSize()[0]}px`,
      'height': `${appScale() * textSize()[1]}px`
    }}>
      <div style={{'transform-origin': '0 0', 'transform': `scale(${appScale()})`}}>
        <div class='sticker-container'>
          { /* TOOD: upscale text (yes even more bcoz we scale and it's a bit blurry) */ }
          <TextRenderer textSizeUpdate={setTextSize} text={props.textData.text} state={props.textData} />
        </div>
      </div>
      <Show when={props.selected}>
        <div draggable={true} onDragStart={ev => handleDragStart(ev, 0)} onDragEnd={handleDragEnd} class='crop-handle top left'></div>
        <div draggable={true} onDragStart={ev => handleDragStart(ev, 1)} onDragEnd={handleDragEnd} class='crop-handle top right'></div>
        <div draggable={true} onDragStart={ev => handleDragStart(ev, 2)} onDragEnd={handleDragEnd} class='crop-handle bottom left'></div>
        <div draggable={true} onDragStart={ev => handleDragStart(ev, 3)} onDragEnd={handleDragEnd} class='crop-handle bottom right'></div>
      </Show>
    </div>
  </div>;
}

export const MediaEditorTextsPanel = (props: {
  startDrag: (data: any) => void,
  endDrag: (id: string) => void,
  upd: (p: Point) => Point,
  crop: [Point, Point],
  left: number, top: number, height: number, width: number,
  active: boolean,
  stickers: TextData[],
  updatePos: (id: string, x: number, y: number, rotation: number, scale: number) => void }
) => {
  let container: HTMLDivElement;
  const [containerPos, setContainerPos] = createSignal([0, 0] as [number, number]);
  const [dragPos, setDragPos] = createSignal([0, 0] as [number, number]);
  const [handlerDragPos, setHandlerDragPos] = createSignal([0, 0] as [number, number]);
  const [selectedSticker, setSelectedSticker] = createSignal(null);
  const [resize, setResize] = createSignal(false);

  onMount(() => {
    const {left, top} = container.getBoundingClientRect();
    setContainerPos([left, top]);
  });

  createEffect(() => props.active || setSelectedSticker(null));

  createEffect((prev: TextData[]) => {
    if(props.stickers.length > prev.length) {
      setSelectedSticker(props.stickers.at(-1).id);
    }
    return props.stickers;
  }, props.stickers);

  const drag = (ev: DragEvent) => {
    const {pageX, pageY} = ev;
    const x = pageX - props.left;
    const y = pageY - props.top;
    const res = props.upd({x, y});
    if(resize()) {
      setHandlerDragPos([res.x, res.y]);
    } else {
      setDragPos([res.x, res.y]);
    }
  }

  return <div classList={{'media-editor-stickers-panel': true, 'disabled': !props.active}} >
    <div ref={container} class='container'
      onDragEnter={drag} onDragOver={drag}
      onClick={() => setSelectedSticker(null)}>
      <Index each={props.stickers}>
        { (sticker) => <MediaEditorText
          startDrag={props.startDrag}
          endDrag={() => props.endDrag(sticker().id)}
          top={props.top} left={props.left} width={props.width} height={props.height}
          upd={props.upd} crop={props.crop}
          resize={resize()} textData={sticker()}
          x={sticker().x} y={sticker().y}
          rotation={sticker().rotation}
          scale={sticker().scale}
          updatePos={(x, y, rotation, scale) => {
            props.updatePos(sticker().id, x, y, rotation, scale);
            setDragPos([0, 0]);
            setHandlerDragPos([0, 0]);
          }}
          selected={sticker().id === selectedSticker()} select={ev => {
            ev?.stopImmediatePropagation();
            setSelectedSticker(sticker().id);
          }} dragPos={dragPos()} containerPos={containerPos()}
          handlerDragPos={handlerDragPos()}
          setHandlerDragPos={setHandlerDragPos}
          setResize={setResize} /> }
      </Index>
    </div>
  </div>
};
