import {createSignal, For, JSX} from 'solid-js';

export const TripletButtons = (props: { buttons: JSX.Element[] }) => {
  const [selected, setSelected] = createSignal(0);

  return <div class='triplet-buttons'>
    <For each={props.buttons}>
      { (button, idx) => <div classList={{button: true, selected: idx() === selected()}}
        onClick={() => setSelected(idx())}>{ button }</div>}
    </For>
  </div>
}
