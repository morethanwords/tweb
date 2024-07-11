import {createSignal, For, JSX, Signal} from 'solid-js';

export const MediaEditorFontPicker = (props: { selectedFont: number, setFont: (val: number) => void }) => {
  const toolsConfig = [
    ['Roboto', {'font-weight': 500}],
    ['Typewriter', {'font-weight': 600}],
    ['Avenir Next', {'font-style': 'italic'}],
    ['Courier New'],
    ['Noteworthy'],
    ['Georgia'],
    ['Papyrus', {'font-size': '18px', 'font-weight': 400}],
    ['Snell Roundhand', {'font-size': '18px', 'font-style': 'italic'}]
  ] as [string, JSX.CSSProperties][];
  const toolsConfig2 = toolsConfig.map(([font, styles]) => [font, {...styles, 'font-family': font}]) as [string, JSX.CSSProperties][];

  return <div class='tool-picker'>
    <For each={toolsConfig2}>
      { (tool, idx) => <div classList={{'tool': true, 'font': true, 'selected': props.selectedFont === idx()}}
        style={tool[1]}
        onClick={() => props.setFont(idx())}>
        { tool[0] }
      </div> }
    </For>
  </div>;
};
