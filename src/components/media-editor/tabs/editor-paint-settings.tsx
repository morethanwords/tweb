import {MediaEditorColorPicker} from '../components/color-picker';
import {MediaEditorSlider} from '../editor-slider';
import {createEffect, createSignal} from 'solid-js';
import {MediaEditorTookPicker} from '../components/tool-picker';
import {MediaEditorState} from '../../appMediaEditor';
import {SetStoreFunction} from 'solid-js/store';

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

export const MediaEditorPaintSettings = (props: { state: MediaEditorState['paint'], updateState: SetStoreFunction<MediaEditorState> }) => {
  const hexColor = () => {
    const selectedColor = props.state.color;
    return typeof selectedColor === 'number' ? colors[selectedColor] : selectedColor;
  };

  createEffect(() => console.info(hexColor()));

  return <div class='settings-container paint-container'>
    <MediaEditorColorPicker defaultColors={colors} selectedColor={props.state.color} setSelected={val => props.updateState('paint', 'color', val)} />

    <MediaEditorSlider color={hexColor()} label='TextSize' change={val => props.updateState('paint', 'size', val)} initialValue={props.state.size} min={1} max={30}  />

    <MediaEditorTookPicker />
  </div>
};
