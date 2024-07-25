import {createEffect, createSignal, Index, onMount, Show} from 'solid-js';
import wrapSticker from '../../wrappers/sticker';
import rootScope from '../../../lib/rootScope';

export interface StickerData {
  id: string;
  docId: number;
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
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
  updatePos: (x: number, y: number) => void,
  docId: number, x: number, y: number,
  dragPos: [number, number],
  selected: boolean,
  select: (ev?: MouseEvent) => void }
) => {
  let element: HTMLDivElement;
  const [size, setSize] = createSignal([200, 200]);
  const [dragging, setDragging] = createSignal(false);
  const [initDragPos, setInitDragPos] = createSignal([0, 0]);
  const [scale, setScale] = createSignal([1, 1]);
  const img = new Image();

  const propsXY = () => ({x: props.x - 100, y: props.y - 100});

  createEffect(() => {
    if(props.resize) {
      const [w, h] = size();

      if(props.dragPos.some(Boolean)) {
        const posX = props.dragPos[0] - propsXY().x;
        const posY = props.dragPos[1] - propsXY().y;
        const scaleX = posX / w;
        const scaleY = posY / h;

        setScale([scaleX, scaleY]);
      }
    }
  });

  // SUPER EASY TO ADD CORRECT ROTATION, just ANGLE() and that's it
  const styles = () => dragging() && props.dragPos.some(Boolean) ? [props.dragPos[0] - initDragPos()[0], props.dragPos[1] - initDragPos()[1]] : [propsXY().x, propsXY().y];

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
    props.startDrag({x: props.x, y: props.y}); // rotation scale too
    ev.dataTransfer.setDragImage(img, 0, 0);
    setDragging(true);
    props.select();

    const {pageX, pageY} = ev;
    const x = pageX - props.left;
    const y = pageY - props.top;
    const res = props.upd({x, y});
    console.info('start pos', res);
    setInitDragPos([res.x - propsXY().x, res.y - propsXY().y]);
  };

  const onDragEnd = () => {
    setDragging(false);
    props.updatePos(props.dragPos[0] - initDragPos()[0] + 100, props.dragPos[1] - initDragPos()[1] + 100);
    props.endDrag();
  }

  const handleDragStart = (ev: DragEvent) => {
    ev.stopImmediatePropagation();
    props.select();
    props.setResize(true);
  }

  const handleDragEnd = (ev: DragEvent) => {
    ev.stopImmediatePropagation();
    props.setResize(false);
  }

  // scale(${scale()[0]},
  // makeparetn container which wel apply the handlers, and the inside will be the scaling of the rlottie player
  return <div draggable={true} onDragStart={onDragStart} onDragEnd={onDragEnd}
    onClick={props.select} classList={{'media-editor-placed-sticker': true, 'selected': props.selected}}
    style={{
      'width': `${scale()[0] * 200}px`,
      'height': `${scale()[1] * 200}px`,
      'transform': `translate(${Math.round(styles()[0])}px, ${Math.round(styles()[1])}px)`,
      'transform-origin': 'center'
    }}>
    <div ref={element} class='sticker-container' style={{transform: `scale(${scale()[0]}, ${scale()[1]})`}}></div>
    <Show when={props.selected}>
      <div draggable={true} onDragStart={handleDragStart} onDragEnd={handleDragEnd} class='crop-handle top left'></div>
      <div draggable={true} onDragStart={handleDragStart} onDragEnd={handleDragEnd} class='crop-handle top right'></div>
      <div draggable={true} onDragStart={handleDragStart} onDragEnd={handleDragEnd} class='crop-handle bottom left'></div>
      <div draggable={true} onDragStart={handleDragStart} onDragEnd={handleDragEnd} class='crop-handle bottom right'></div>
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
  updatePos: (id: string, x: number, y: number) => void }
) => {
  let container: HTMLDivElement;
  const [containerPos, setContainerPos] = createSignal([0, 0] as [number, number]);
  const [dragPosRaw, setDragPosRaw] = createSignal([0, 0]);
  const dragPos = () => [dragPosRaw()[0], dragPosRaw()[1]] as [number, number];
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
    setDragPosRaw([res.x, res.y]);
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
          resize={resize()} docId={sticker().docId} x={sticker().x} y={sticker().y}
          updatePos={(x, y) => {
            props.updatePos(sticker().id, x, y);
            setDragPosRaw([0, 0]);
          }}
          selected={sticker().id === selectedSticker()} select={ev => {
            ev?.stopImmediatePropagation();
            setSelectedSticker(sticker().id);
          }} dragPos={dragPos()} containerPos={containerPos()} setResize={setResize} /> }
      </Index>
    </div>
  </div>
};
