import {For, JSX} from 'solid-js';

export const TripletButtons = (props: { buttons: JSX.Element[], selected: number, setSelected: (val: number) => void }) => {
  return <div class='triplet-buttons'>
    <For each={props.buttons}>
      { (button, idx) => <div classList={{button: true, selected: idx() === props.selected}}
        onClick={() => props.setSelected(idx())}>{ button }</div>}
    </For>
  </div>
}
