import {createSignal, For, Show, Signal} from 'solid-js';
import ColorPicker from '../../colorPicker';

export const MediaEditorColorPicker = ({defaultColors, selectedColor}: { defaultColors: string[], selectedColor: Signal<string | number> }) => {
  const [custom, setCustom] = createSignal(false);
  const [openedCustom, setOpenedCustom] = createSignal(false);
  const [currentColor, setCurrentColor] = selectedColor;

  const colorPicker = new ColorPicker(true);
  colorPicker.setColor('#FFFFFF');

  colorPicker.onChange = color => {
    setCustom(true);
    setCurrentColor(color.hex);
  };

  return <div class='editor-color-picker'>
    <div class='editor-dots-color-picker'>
      <For each={defaultColors}>
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
