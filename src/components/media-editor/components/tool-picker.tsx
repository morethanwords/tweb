import {Arrow, Blur, Brush, Eraser, Neon, Pen} from './tools';
import {createEffect, createSignal, For, ValidComponent} from 'solid-js';
import {Dynamic} from 'solid-js/web';


// we will have a state (map)
/*
populated at init
[tool name] -> color (number | string)
...
+ selected tool

selected color -> tools[selected tool].color
set color -> same

 */

export const MediaEditorTookPicker = () => {
  // state
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
  const [selected, setSelected] = createSignal(0);
  // state end
  const toolsConfig = [
    ['Pen', Pen],
    ['Arrow', Arrow],
    ['Brush', Brush],
    ['Neon', Neon],
    ['Eraser', Eraser],
    ['Blur', Blur]
  ] as [string, ValidComponent][];

  return <div class='tool-picker'>
    <For each={toolsConfig}>
      { (tool, idx) => <div classList={{'tool': true, 'selected':selected() === idx()}} onClick={() => setSelected(idx())}>
        <div class='tool-media'>
          <Dynamic component={tool[1]} color={colors[idx()]} />
        </div>
        <span>{ tool[0] }</span>
      </div> }
    </For>
  </div>;
};
