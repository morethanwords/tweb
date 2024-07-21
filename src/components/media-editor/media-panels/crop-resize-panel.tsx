import {MediaEditorSettings} from '../../appMediaEditor';
import {createEffect, createSignal, For, onMount} from 'solid-js';
import {SetStoreFunction} from 'solid-js/store';

// °
export const CropResizePanel = (props: { active: boolean, state: MediaEditorSettings['angle'], updateState: SetStoreFunction<MediaEditorSettings> }) => {
  const angleLabel = [...Array(13).keys()].map(idx => (idx - 6) * 15);
  const [containerPos, setContainerPos] = createSignal([0, 0]);
  const [initDragPos, setInitDragPos] = createSignal(0);

  const [prev, setPrev] = createSignal(0);
  const [dragValue, setDragValue] = createSignal(0);
  const img = new Image();
  let container: HTMLDivElement;
  let debounceTimer: any;

  onMount(() => {
    const {left, width} = container.getBoundingClientRect();
    setContainerPos([left, width]);
    console.info(left, width);
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
  });

  const handleDragStart = (ev: DragEvent) => {
    ev.stopImmediatePropagation();
    ev.dataTransfer.setDragImage(img, 0, 0);
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

  const currentAngle = () => Math.floor(Math.max(-90, Math.min(-dragValue() / (containerPos()[1] / (181 + 10)), 90)));

  createEffect(prevAngle => {
    if(prevAngle !== currentAngle()) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        props.updateState('angle', currentAngle())
      }, 75);
    }
    return currentAngle();
  }, currentAngle());

  const fn = (angle: number, curr: number) => {
    const absolute = Math.abs(angle - curr);
    if(absolute < 5) {
      return 1.0;
    }
    return 0.6 - (0.12 * absolute / 20);
  }

  return <div classList={{'crop-resize-panel-container': true, 'active': props.active}}>
    <div>Left</div>
    <div ref={container} class='angle-container' onDragEnter={drag} onDragOver={drag}>
      <span class='angle-marker'>{ currentAngle() }</span>
      <div style={{transform: `translateX(${dragValue()}px)`}} class='angle' draggable={true} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div class='labels'>
          <For each={angleLabel}>
            { angle => <div style={{opacity: fn(angle, currentAngle())}} classList={{label: true, selected: Math.abs(angle - currentAngle()) < 1}}>{angle < 0 ? -angle : angle}</div> }
          </For>
        </div>
        { /* dots here */ }
      </div>
    </div>
    <div>Right</div>
  </div>;
};
