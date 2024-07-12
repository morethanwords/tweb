import {Arrow, Blur, Brush, Eraser, Neon, Pen} from './tools';
import {For, ValidComponent} from 'solid-js';
import {Dynamic} from 'solid-js/web';

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

export const MediaEditorTookPicker = (props: { tool: number, tools: (string | number)[], setTool: (val: number) => void }) => {
  const toolsConfig = [
    ['Pen', Pen],
    ['Arrow', Arrow],
    ['Brush', Brush],
    ['Neon', Neon],
    ['Eraser', Eraser],
    ['Blur', Blur]
  ] as [string, ValidComponent][];

  // move to one place
  const hexColor = (color: number | string) => {
    return typeof color === 'number' ? colors[color] : color;
  };

  return <div class='tool-picker'>
    <For each={toolsConfig}>
      { (tool, idx) => <div classList={{'tool': true, 'selected': props.tool === idx()}} onClick={() => props.setTool(idx())}>
        <div class='tool-media'>
          <Dynamic component={tool[1]} color={hexColor(props.tools[idx()])} />
        </div>
        <span>{ tool[0] }</span>
      </div> }
    </For>
  </div>;
};
