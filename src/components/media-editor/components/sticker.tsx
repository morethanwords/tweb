import {createSignal, onMount} from 'solid-js';
import wrapSticker from '../../wrappers/sticker';
import rootScope from '../../../lib/rootScope';
import TDrag from '../../../lib/tchart/drag';
import debug from '../../../config/debug';

// pass pos + rotation
export const MediaEditorSticker = (props: { dragPos: number[], cancelDrag: () => void, docId: number, selected?: boolean }) => {
  let element: HTMLDivElement;
  const [initPos, setInitPos] = createSignal<number[]>([]);
  const [started, setStarted] = createSignal(false);
  const dragPos = () => props.selected ?
    {transform: `translate(${props.dragPos[0] - initPos()[0]}px, ${props.dragPos[1] - initPos()[1]}px)`} : {};

  const img = new Image();

  onMount(async() => {
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

  const onDragStart = (args: any) => {
    args.dataTransfer.setDragImage(img, 0, 0);
    const {left, top} = element.getBoundingClientRect();
    setStarted(true);
    setInitPos([args.pageX - left, args.pageY - top]);
  }

  const onDragEnd = (args: any) => {
    setStarted(false);
    props.cancelDrag();
  }

  return <div style={dragPos()} onDragStart={onDragStart} onDragEnd={onDragEnd} classList={{'media-editor-sticker': true, 'selected': props.selected}} ref={element}></div>;
}
