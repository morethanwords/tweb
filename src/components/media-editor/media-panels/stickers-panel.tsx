import {createEffect, createSignal, Index, onMount, Show} from 'solid-js';
import wrapSticker from '../../wrappers/sticker';
import rootScope from '../../../lib/rootScope';

export interface StickerData {
  id: string;
  docId: number;
  x: number;
  y: number;
}

const MediaEditorSticker = (props: { resize: boolean, setResize: (val: boolean) => void, containerPos: [number, number], updatePos: (x: number, y: number) => void, docId: number, x: number, y: number, dragPos: [number, number], selected: boolean, select: (ev?: MouseEvent) => void }) => {
  let element: HTMLDivElement;
  const [size, setSize] = createSignal([200, 200]);
  const [dragging, setDragging] = createSignal(false);
  const [initDragPos, setInitDragPos] = createSignal([0, 0]);
  const [scale, setScale] = createSignal([1, 1]);
  const img = new Image();

  createEffect(() => {
    if(props.resize) {
      const [w, h] = size();

      if(props.dragPos.some(Boolean)) {
        // console.info(props.dragPos, props.x, props.y);

        const posX = props.dragPos[0] - props.x;
        const posY = props.dragPos[1] - props.y;
        const scaleX = posX / w;
        const scaleY = posY / h;

        // console.info(scaleX, scaleY);
        setScale([scaleX, scaleY]);
      }
      /* if(props.dragPos.some(Boolean)) {


        setScale([scaleX, scaleY]);
      } else {
        const scaleX = props.x / w;
        const scaleY = props.y / h;


      } */


      // const scaleX =
    }
  })

  // createEffect(() => console.info(scale()));

  const styles = () => dragging() && props.dragPos.some(Boolean) ?
    [props.dragPos[0] - initDragPos()[0], props.dragPos[1] - initDragPos()[1]] : [props.x, props.y];

  onMount(async() => {
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
    const loadPromises: Promise<any>[] = [];
    console.info(element);
    const res = await wrapSticker({
      doc: await rootScope.managers.appDocsManager.getDoc(props.docId),
      div: element,
      loadPromises,
      width: 200,
      height: 200
      // loop: true,
      // play: true
    });
  });

  const onDragStart = (ev: DragEvent) => {
    ev.dataTransfer.setDragImage(img, 0, 0);
    setDragging(true);
    props.select();
    setInitDragPos([ev.pageX - props.x - props.containerPos[0], ev.pageY - props.y - props.containerPos[1]]);
  };

  const onDragEnd = () => {
    setDragging(false);
    props.updatePos(props.dragPos[0] - initDragPos()[0], props.dragPos[1] - initDragPos()[1]);
  }

  const handleDragStart = (ev: DragEvent) => {
    ev.stopImmediatePropagation();
    // ev.dataTransfer.setDragImage(img, 0, 0);
    props.select();
    props.setResize(true);
    // setInitDragPos([ev.pageX - props.x - props.containerPos[0], ev.pageY - props.y - props.containerPos[1]]);
    console.info(ev);
  }

  const handleDragEnd = (ev: DragEvent) => {
    ev.stopImmediatePropagation();
    props.setResize(false);
    // console.info(ev); */
  }


  // width: `${scale()[0] * 200}px`, height: `${scale()[1] * 200}px`,
  // scale(${scale()[0]}, 1
  // makeparetn container which wel apply the handlers, and the inside will be the scaling of the rlottie player
  return <div draggable={true} onDragStart={onDragStart} onDragEnd={onDragEnd}
    onClick={props.select} classList={{'media-editor-placed-sticker': true, 'selected': props.selected}}
    style={{transform: `translate(${Math.round(styles()[0])}px, ${Math.round(styles()[1])}px)`}}>
    <div ref={element} class='sticker-container' style={{transform: `scale(${scale()[0]}, ${scale()[1]})`}}></div>
    <Show when={props.selected}>
      <div draggable={true} onDragStart={handleDragStart} onDragEnd={handleDragEnd} class='crop-handle top left'></div>
      <div draggable={true} onDragStart={handleDragStart} onDragEnd={handleDragEnd} class='crop-handle top right'></div>
      <div draggable={true} onDragStart={handleDragStart} onDragEnd={handleDragEnd} class='crop-handle bottom left'></div>
      <div draggable={true} onDragStart={handleDragStart} onDragEnd={handleDragEnd} class='crop-handle bottom right'></div>
    </Show>
  </div>;
}

export const MediaEditorStickersPanel = (props: { stickers: StickerData[], updatePos: (id: string, x: number, y: number) => void }) => {
  let container: HTMLDivElement;
  const [containerPos, setContainerPos] = createSignal([0, 0] as [number, number]);
  const [dragPosRaw, setDragPosRaw] = createSignal([0, 0]);
  const dragPos = () => [Math.floor(Math.max(0, dragPosRaw()[0] - containerPos()[0])), Math.floor(Math.max(0, dragPosRaw()[1] - containerPos()[1]))] as [number, number];
  const [selectedSticker, setSelectedSticker] = createSignal(null);
  const [resize, setResize] = createSignal(false);

  onMount(() => {
    const {left, top} = container.getBoundingClientRect();
    setContainerPos([left, top]);
  })

  createEffect((prev: StickerData[]) => {
    if(props.stickers.length > prev.length) {
      setSelectedSticker(props.stickers.at(-1).id);
    }
    return props.stickers;
  }, props.stickers);

  return <div class='media-editor-stickers-panel'>
    <div ref={container} class='container'
      onDragEnter={ev => setDragPosRaw([ev.clientX, ev.clientY])}
      onDragOver={ev => setDragPosRaw([ev.clientX, ev.clientY])}
      onClick={() => setSelectedSticker(null)}>
      <Index each={props.stickers}>
        { (sticker) => <MediaEditorSticker resize={resize()} docId={sticker().docId} x={sticker().x} y={sticker().y}
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
