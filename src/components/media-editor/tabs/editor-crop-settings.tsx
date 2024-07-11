import {createSignal, For} from 'solid-js';
import freeIcon from '../svg/crop/free.svg';
import originalIcon from '../svg/crop/original.svg';
import squareIcon from '../svg/crop/square.svg';
import threeBy2 from '../svg/crop/3by2.svg';
import fourBy3 from '../svg/crop/4by3.svg';
import fiveBy4 from '../svg/crop/5by4.svg';
import sevenBy5 from '../svg/crop/7by5.svg';
import sixteenBy9 from '../svg/crop/16by9.svg';

export const MediaEditorCropSettings = (props: { crop: number, setCrop: (val: number) => void }) => {
  // state end
  const aspectRatios = [
    {label: 'Free', icon: freeIcon},
    {label: 'Original', icon: originalIcon},
    {label: 'Square', icon: squareIcon},
    {label: '3:2', icon: threeBy2},
    {label: '2:3', icon: threeBy2, rotate: true},
    {label: '4:3', icon: fourBy3},
    {label: '3:4', icon: fourBy3, rotate: true},
    {label: '5:4', icon: fiveBy4},
    {label: '4:5', icon: fiveBy4, rotate: true},
    {label: '7:5', icon: sevenBy5},
    {label: '5:7', icon: sevenBy5, rotate: true},
    {label: '16:9', icon: sixteenBy9},
    {label: '9:16', icon: sixteenBy9, rotate: true}
  ];
  const fullWidth = aspectRatios.slice(0, 3);
  const symmetrical = aspectRatios.slice(3);

  return <div class='settings-container paint-container crop-container'>
    <div class='tool-picker crop-settings'>
      <For each={fullWidth}>
        { (ratio, idx) => <div classList={{'tool': true, 'selected': props.crop === idx()}} onClick={() => props.setCrop(idx())}>
          <img src={ratio.icon} alt={ratio.label}/>
          <span>{ ratio.label }</span>
        </div> }
      </For>
    </div>
    <div class='tool-picker crop-settings grid'>
      <For each={symmetrical}>
        { (ratio, idx) => <div classList={{'tool': true, 'selected': props.crop === idx() + 3}} onClick={() => props.setCrop(idx() + 3)}>
          <img src={ratio.icon} alt={ratio.label} classList={{rotate: ratio.rotate}}/>
          <span>{ ratio.label }</span>
        </div> }
      </For>
    </div>
  </div>
};
