import {createSignal, For, Show, Signal} from 'solid-js';
import ColorPicker from '../../colorPicker';

export const MediaEditorColorPicker = (props: { defaultColors: string[], selectedColor: string | number, setSelected: (val: number | string) => void }) => {
  const [custom, setCustom] = createSignal(false);
  const [openedCustom, setOpenedCustom] = createSignal(false);

  const colorPicker = new ColorPicker(true);
  colorPicker.setColor('#FFFFFF');

  colorPicker.onChange = color => {
    setCustom(true);
    props.setSelected(color.hex);
  };

  return <div class='editor-color-picker'>
    <div class='editor-dots-color-picker'>
      <For each={props.defaultColors}>
        {(color, idx) => <div class='dot-color-outer' style={{visibility: openedCustom() ? 'hidden' : 'visible', background: idx() === props.selectedColor ? `${color}1A` : 'transparent'}}>
          <div class='dot-color-inner' style={{background: color}} onClick={() => {
            props.setSelected(idx());
            setCustom(false);
          }}></div>
        </div>}
      </For>
      <div class='dot-color-outer' style={{background: custom() || (openedCustom()) ? '#FFFFFF1A' : 'transparent'}}>
        <div classList={{'dot-color-inner custom': true, 'selected': custom()}} style={{background: custom() ? `${props.selectedColor}` : 'transparent'}}
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
