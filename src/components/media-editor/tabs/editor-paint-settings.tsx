import {MediaEditorColorPicker} from '../components/color-picker';
import {MediaEditorSlider} from '../editor-slider';
import {createEffect, createSignal} from 'solid-js';
import {MediaEditorTookPicker} from '../components/tool-picker';

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

export const MediaEditorPaintSettings = () => {
  const selectedColor = createSignal<number | string>(0);
  const [color] = selectedColor;
  const hexColor = () => {
    const selectedColor = color();
    return typeof selectedColor === 'number' ? colors[selectedColor] : selectedColor;
  };

  createEffect(() => console.info(hexColor()));

  return <div class='settings-container paint-container'>
    <MediaEditorColorPicker defaultColors={colors} selectedColor={selectedColor}/>

    <MediaEditorSlider color={hexColor} label='TextSize' change={console.info} initialValue={15} min={1} max={30}  />

    <MediaEditorTookPicker />
  </div>
};
