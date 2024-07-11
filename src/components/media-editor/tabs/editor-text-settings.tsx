import {MediaEditorColorPicker} from '../components/color-picker';
import {MediaEditorSlider} from '../editor-slider';
import {TripletButtons} from '../components/triplet-buttons';
import leftAlign from '../svg/left-text.svg';
import centerAlign from '../svg/middle-text.svg';
import rightAlign from '../svg/text-right.svg';

import fontNoFrame from '../svg/font-no-frame.svg';
import fontWhite from '../svg/font-white.svg';
import fontBlack from '../svg/font-black.svg';
import {MediaEditorFontPicker} from '../components/font-picker';
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

export const MediaEditorTextSettings = (props: { state: MediaEditorState['text'], updateState: SetStoreFunction<MediaEditorState> }) => {
  const hexColor = () => {
    const selectedColor = props.state.color;
    return typeof selectedColor === 'number' ? colors[selectedColor] : selectedColor;
  };

  // refactor to strings
  const textAlignButtons = [<img src={leftAlign} alt='Left Align' />, <img src={centerAlign} alt='Middle Align' />, <img src={rightAlign} alt='Right Align' />];
  const textFontButtons = [<img src={fontNoFrame} alt='Font No Frame' />, <img src={fontWhite} alt='Font White' />, <img src={fontBlack} alt='Font Black' />];

  return <div class='settings-container paint-container'>
    <MediaEditorColorPicker defaultColors={colors} selectedColor={props.state.color} setSelected={val => props.updateState('text', 'color', val)} />

    <div class='font-settings'>
      <TripletButtons buttons={textAlignButtons} selected={props.state.align} setSelected={val => props.updateState('text', 'align', val)} />
      <TripletButtons buttons={textFontButtons} selected={props.state.outline} setSelected={val => props.updateState('text', 'outline', val)}/>
    </div>
    <MediaEditorSlider color={hexColor()} label='TextSize' change={val => props.updateState('text', 'size', val)} initialValue={props.state.size} min={1} max={30}/>

    <MediaEditorFontPicker selectedFont={props.state.font} setFont={val => props.updateState('text', 'font', val)} />
  </div>
}
