import {createSignal, For, Show} from 'solid-js';
import ColorPicker from '../../colorPicker';

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

export const MediaEditorColorPicker = () => {
  const [custom, setCustom] = createSignal(false);
  const [openedCustom, setOpenedCustom] = createSignal(false);
  const [currentColor, setCurrentColor] = createSignal<number | string>(0);

  const colorPicker = new ColorPicker(true);
  colorPicker.setColor('#FFFFFF');

  return <div class='editor-color-picker'>
    <div class='editor-dots-color-picker'>
      <For each={colors}>
        {(color, idx) => <div class='dot-color-outer' style={{visibility: openedCustom() ? 'hidden' : 'visible', background: idx() === currentColor() ? `${color}1A` : 'transparent'}}>
          <div class='dot-color-inner' style={{background: color}} onClick={() => setCurrentColor(idx)}></div>
        </div>}
      </For>
      <div class='dot-color-outer' style={{background: custom() || (openedCustom()) ? '#FFFFFF1A' : 'transparent'}}>
        <div class='dot-color-inner custom' onClick={() => setOpenedCustom(val => !val)}>
          <img src='assets/img/color-wheel.png' />
        </div>
      </div>
    </div>

    <Show when={openedCustom()}>
      <div class='custom-picker'>
        { colorPicker.container }
      </div>
    </Show>
  </div>
};
