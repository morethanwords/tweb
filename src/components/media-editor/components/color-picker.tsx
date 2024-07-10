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

  colorPicker.onChange = color => {
    setCustom(true);
    setCurrentColor(color.hex);
  };

  return <div class='editor-color-picker'>
    <div class='editor-dots-color-picker'>
      <For each={colors}>
        {(color, idx) => <div class='dot-color-outer' style={{visibility: openedCustom() ? 'hidden' : 'visible', background: idx() === currentColor() ? `${color}1A` : 'transparent'}}>
          <div class='dot-color-inner' style={{background: color}} onClick={() => {
            setCurrentColor(idx);
            setCustom(false);
          }}></div>
        </div>}
      </For>
      <div class='dot-color-outer' style={{background: custom() || (openedCustom()) ? '#FFFFFF1A' : 'transparent'}}>
        <div classList={{'dot-color-inner custom': true, 'selected': custom()}} style={{background: custom() ? `${currentColor()}` : 'transparent'}}
          onClick={() => setOpenedCustom(val => !val)}>
          <Show when={!custom()}>
            <img src='assets/img/color-wheel.png' />
          </Show>
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
