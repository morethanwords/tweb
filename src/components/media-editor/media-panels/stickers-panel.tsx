import {createEffect, createSignal, Index, onMount, Show} from 'solid-js';
import wrapSticker from '../../wrappers/sticker';
import rootScope from '../../../lib/rootScope';

export interface StickerData {
  id: string;
  docId: number;
  x: number;
  y: number;
  rotation: number;
}

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

function getAngle(pointA: Point, pointB: Point, pointC: Point) {
  const vectorAB = {x: pointA.x - pointB.x, y: pointA.y - pointB.y};
  const vectorBC = {x: pointC.x - pointB.x, y: pointC.y - pointB.y};

  // Calculate the dot product of AB and BC
  const dotProduct = vectorAB.x * vectorBC.x + vectorAB.y * vectorBC.y;

  // Calculate the magnitudes of AB and BC
  const magnitudeAB = Math.sqrt(vectorAB.x * vectorAB.x + vectorAB.y * vectorAB.y);
  const magnitudeBC = Math.sqrt(vectorBC.x * vectorBC.x + vectorBC.y * vectorBC.y);

  // Calculate the cosine of the angle
  const cosTheta = dotProduct / (magnitudeAB * magnitudeBC);

  // Calculate the angle in radians
  const angleRad = Math.acos(cosTheta);

  // Convert the angle to degrees
  const angleDeg = angleRad * (180 / Math.PI);

  // Calculate the cross product to determine the direction
  const crossProduct = vectorAB.x * vectorBC.y - vectorAB.y * vectorBC.x;
  const direction = crossProduct > 0 ? 'counterclockwise' : 'clockwise';

  return crossProduct > 0 ? angleDeg : -angleDeg;
}

const MediaEditorSticker = (props: {
  startDrag: (data: any) => void,
  endDrag: () => void,
  upd: (p: Point) => Point,
  crop: [Point, Point],
  left: number,
  top: number,
  height: number,
  width: number,
  resize: boolean,
  setResize: (val: boolean) => void,
  containerPos: [number, number],
  updatePos: (x: number, y: number, rotation: number) => void,
  docId: number, x: number, y: number, rotation: number,
  dragPos: [number, number],
  handlerDragPos: [number, number],
  setHandlerDragPos: (val: [number, number]) => void,
  selected: boolean,
  select: (ev?: MouseEvent) => void }
) => {
  let element: HTMLDivElement;
  const [size, setSize] = createSignal([200, 200]);
  const [dragging, setDragging] = createSignal(false);
  const [initDragPos, setInitDragPos] = createSignal([0, 0]);
  const [initHandleDragPos, setInitHandleDragPos] = createSignal([0, 0]);
  const [scale, setScale] = createSignal([1, 1]);
  const img = new Image();

  const [rot, setRot] = createSignal(0);
  const propsXY = () => ({x: props.x - 100, y: props.y - 100});


  createEffect(() => {
    if(props.resize) {
      const origin = {x: initHandleDragPos()[0], y: initHandleDragPos()[1]};
      const center = {x: props.x, y: props.y};
      const target = {x: props.handlerDragPos[0], y: props.handlerDragPos[1]};
      const angle = getAngle(origin, center, target);
      setRot(-angle);
    }
  });

  createEffect(() => {
    console.info('ROT', props.rotation);
  })

  const styles = () => props.selected && dragging() && props.dragPos.some(Boolean) ? [props.dragPos[0] - initDragPos()[0], props.dragPos[1] - initDragPos()[1]] : [propsXY().x, propsXY().y];
  const appRotation = () => props.selected && props.resize && props.handlerDragPos.some(Boolean) ? props.rotation - rot() : props.rotation;

  onMount(async() => {
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
    const loadPromises: Promise<any>[] = [];
    console.info(element);
    await wrapSticker({
      doc: await rootScope.managers.appDocsManager.getDoc(props.docId),
      div: element,
      loadPromises,
      width: 200,
      height: 200,
      loop: true,
      play: true
    });
  });

  const onDragStart = (ev: DragEvent) => {
    props.startDrag({x: props.x, y: props.y, rotation: props.rotation}); // rotation scale too
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
    props.updatePos(props.dragPos[0] - initDragPos()[0] + 100, props.dragPos[1] - initDragPos()[1] + 100, props.rotation);
    props.endDrag();
  }

  const handleDragStart = (ev: DragEvent, idx: number) => {
    props.startDrag({x: props.x, y: props.y, rotation: props.rotation}); // rotation scale too
    ev.stopImmediatePropagation();
    props.select();
    const {pageX, pageY} = ev;
    const x = pageX - props.left;
    const y = pageY - props.top;
    const res = props.upd({x, y});
    setInitHandleDragPos([res.x, res.y]);
    props.setHandlerDragPos([res.x, res.y]);
    props.setResize(true);
  }

  const handleDragEnd = (ev: DragEvent) => {
    ev.stopImmediatePropagation();
    props.updatePos(props.x, props.y, props.rotation - rot());
    props.endDrag(); // rename to commit or smth
    props.setResize(false);
    props.setHandlerDragPos([0, 0]);
    setInitHandleDragPos([0, 0]);
  }

  // scale(${scale()[0]},
  // makeparetn container which wel apply the handlers, and the inside will be the scaling of the rlottie player
  return <div draggable={true} onDragStart={onDragStart} onDragEnd={onDragEnd}
    onClick={props.select} classList={{'media-editor-placed-sticker': true, 'selected': props.selected}}
    style={{
      'width': `${scale()[0] * 200}px`,
      'height': `${scale()[1] * 200}px`,
      'transform': `translate(${Math.round(styles()[0])}px, ${Math.round(styles()[1])}px) rotate(${appRotation()}deg)`,
      'transform-origin': 'center'
    }}>
    <div ref={element} class='sticker-container' style={{transform: `scale(${scale()[0]}, ${scale()[1]})`}}></div>
    <Show when={props.selected}>
      <div draggable={true} onDragStart={ev => handleDragStart(ev, 0)} onDragEnd={handleDragEnd} class='crop-handle top left'></div>
      <div draggable={true} onDragStart={ev => handleDragStart(ev, 1)} onDragEnd={handleDragEnd} class='crop-handle top right'></div>
      <div draggable={true} onDragStart={ev => handleDragStart(ev, 2)} onDragEnd={handleDragEnd} class='crop-handle bottom left'></div>
      <div draggable={true} onDragStart={ev => handleDragStart(ev, 3)} onDragEnd={handleDragEnd} class='crop-handle bottom right'></div>
    </Show>
  </div>;
}

export const MediaEditorStickersPanel = (props: {
  startDrag: (data: any) => void,
  endDrag: (id: string) => void,
  upd: (p: Point) => Point,
  crop: [Point, Point],
  left: number, top: number, height: number, width: number,
  active: boolean, stickers: StickerData[],
  updatePos: (id: string, x: number, y: number, rotation: number) => void }
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

  createEffect((prev: StickerData[]) => {
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
        { (sticker) => <MediaEditorSticker
          startDrag={props.startDrag}
          endDrag={() => props.endDrag(sticker().id)}
          top={props.top} left={props.left} width={props.width} height={props.height}
          upd={props.upd} crop={props.crop}
          resize={resize()} docId={sticker().docId}
          x={sticker().x} y={sticker().y}
          rotation={sticker().rotation}
          updatePos={(x, y, rotation) => {
            console.info('wtfffff', x, y, rotation);
            props.updatePos(sticker().id, x, y, rotation);
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
