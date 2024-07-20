import {MediaEditorSettings} from '../../appMediaEditor';
import {createEffect, createSignal, For, onMount} from 'solid-js';

// °
export const CropResizePanel = (props: { active: boolean, state?: MediaEditorSettings['paint'] }) => {
  const angleLabel = [...Array(13).keys()].map(idx => (idx - 6) * 15);
  const [selectedAngle, setSelectedAngle] = createSignal(0);
  const [containerPos, setContainerPos] = createSignal([0, 0]);
  const [initDragPos, setInitDragPos] = createSignal(0);

  const [prev, setPrev] = createSignal(0);
  const [dragValue, setDragValue] = createSignal(0);
  const img = new Image();
  let container: HTMLDivElement;

  onMount(() => {
    const {left, width} = container.getBoundingClientRect();
    setContainerPos([left, width]);
    console.info(left, width);
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
  });

  const handleDragStart = (ev: DragEvent) => {
    ev.stopImmediatePropagation();
    ev.dataTransfer.setDragImage(img, 0, 0);
    console.info(ev);
    setInitDragPos(ev.pageX - containerPos()[0]);
  }

  const handleDragEnd = (ev: DragEvent) => {
    ev.stopImmediatePropagation();
    setPrev(dragValue());
    setInitDragPos(0);
  }

  const drag = (ev: DragEvent) => {
    const mouseVal = ev.pageX - containerPos()[0];
    const dvalue = mouseVal - initDragPos();
    setDragValue(Math.max(-(containerPos()[1] / 2), Math.min(prev() + dvalue, containerPos()[1] / 2) )); // containerPos()[1]
  }

  const currentAngle = () => Math.floor(Math.max(-90, Math.min(-dragValue() / (containerPos()[1] / 181), 90)));

  const fn = (angle: number, curr: number) => {
    const absolute = Math.abs(angle - curr);
    if(absolute < 5) {
      return 1.0;
    }
    return 0.6 - (0.12 * absolute / 20);
  }

  console.info('RESS', fn(45, 90));

  createEffect(() => {
    console.info(currentAngle());
  })

  return <div classList={{'crop-resize-panel-container': true, 'active': props.active}}>
    <div>Left</div>
    <div ref={container} class='angle-container' onDragEnter={drag} onDragOver={drag}>
      <div style={{transform: `translateX(${dragValue()}px)`}} class='angle' draggable={true} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div class='labels'>
          <For each={angleLabel}>
            { angle => <div style={{opacity: fn(angle, currentAngle())}} classList={{label: true, selected: angle === selectedAngle()}}>{angle < 0 ? -angle : angle}</div> }
          </For>
        </div>
        { /* dots here */ }
      </div>
    </div>
    <div>Right</div>
  </div>;
};
