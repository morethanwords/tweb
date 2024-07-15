import {createEffect, createSignal, For, Index, onMount} from 'solid-js';
import wrapSticker from '../../wrappers/sticker';
import rootScope from '../../../lib/rootScope';

export interface StickerData {
  id: string;
  docId: number;
  x: number;
  y: number;
}

const MediaEditorSticker = (props: { containerPos: [number, number], updatePos: (x: number, y: number) => void, docId: number, x: number, y: number, dragPos: [number, number], selected: boolean, select: (ev?: MouseEvent) => void }) => {
  let element: HTMLDivElement;
  const [dragging, setDragging] = createSignal(false);
  const [initDragPos, setInitDragPos] = createSignal([0, 0]);
  const img = new Image();

  const styles = () => dragging() && props.dragPos.every(Boolean) ?
    {transform: `translate(${( props.dragPos[0] - initDragPos()[0])}px, ${( props.dragPos[1] - initDragPos()[1])}px)`} :
    {transform: `translate(${props.x}px, ${props.y}px)`};

  onMount(async() => {
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
    const loadPromises: Promise<any>[] = [];
    const res = await wrapSticker({
      doc: await rootScope.managers.appDocsManager.getDoc(props.docId),
      div: element,
      loadPromises,
      width: 100,
      height: 100,
      loop: true,
      play: true,
      needUpscale: true
    });
  });

  const onDragStart = (ev: DragEvent) => {
    ev.dataTransfer.setDragImage(img, 0, 0);
    setDragging(true);
    props.select();
    setInitDragPos([ev.pageX - props.x - props.containerPos[0], ev.pageY - props.y - props.containerPos[1]]);
  };

  const onDragEnd = (ev: DragEvent) => {
    setDragging(false);
    props.updatePos(props.dragPos[0] - initDragPos()[0], props.dragPos[1] - initDragPos()[1]);
  }

  return <div draggable={true} onDragStart={onDragStart} onDragEnd={onDragEnd}
    onClick={props.select} classList={{'media-editor-placed-sticker': true, 'selected': props.selected}}
    style={styles()} ref={element}></div>;
}

export const MediaEditorStickersPanel = (props: { stickers: StickerData[], updatePos: (id: string, x: number, y: number) => void }) => {
  let container: HTMLDivElement;
  const [containerPos, setContainerPos] = createSignal([0, 0] as [number, number]);
  const [dragPosRaw, setDragPosRaw] = createSignal([0, 0]);
  const dragPos = () => [Math.max(0, dragPosRaw()[0] - containerPos()[0]), Math.max(0, dragPosRaw()[1] - containerPos()[1])] as [number, number];
  const [selectedSticker, setSelectedSticker] = createSignal(null);

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
    <div ref={container} class='container' onDragEnter={ev => setDragPosRaw([ev.clientX, ev.clientY])}
      onDragOver={ev => setDragPosRaw([ev.clientX, ev.clientY])}
      onClick={() => setSelectedSticker(null)}>
      <Index each={props.stickers}>
        { (sticker) => <MediaEditorSticker docId={sticker().docId} x={sticker().x} y={sticker().y}
          updatePos={(x, y) => {
            props.updatePos(sticker().id, x, y);
            setDragPosRaw([0, 0]);
          }}
          selected={sticker().id === selectedSticker()} select={ev => {
            ev?.stopImmediatePropagation();
            setSelectedSticker(sticker().id);
          }} dragPos={dragPos()} containerPos={containerPos()} /> }
      </Index>
    </div>
  </div>
};
