import {MediaEditorColorPicker} from '../components/color-picker';
import {MediaEditorSlider} from '../editor-slider';
import {createEffect, createSignal} from 'solid-js';
import {MediaEditorTookPicker} from '../components/tool-picker';
import {MediaEditorSettings} from '../../appMediaEditor';
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

export const MediaEditorPaintSettings = (props: { state: MediaEditorSettings['paint'], updateState: SetStoreFunction<MediaEditorSettings> }) => {
  const selectedColor = () => props.state.tools[props.state.tool];
  const hexColor = () => {
    const color = selectedColor();
    return typeof color === 'number' ? colors[color] : color;
  };

  createEffect(() => console.info('hexo', hexColor()));

  return <div class='settings-container paint-container'>
    <MediaEditorColorPicker defaultColors={colors} selectedColor={selectedColor()} setSelected={val => {
      console.info('?sdff', val);
      props.updateState('paint', 'tools', props.state.tool, val);
    }} />

    <MediaEditorSlider color={hexColor()} label='TextSize' change={val => props.updateState('paint', 'size', val)} initialValue={props.state.size} min={1} max={30}  />

    <MediaEditorTookPicker tools={props.state.tools} tool={props.state.tool} setTool={val => props.updateState('paint', 'tool', val)} />
  </div>
};
