import {createEffect, JSX, onMount} from 'solid-js';
import {MediaEditorSettings} from '../../appMediaEditor';

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

export const getContrastColor = (hex: string) => {
  hex = hex.charAt(0) === '#' ? hex.substring(1, 7) : hex;
  const colorBrightness = hexToCol(hex, 0, 299) + hexToCol(hex, 2, 587) + hexToCol(hex, 4, 114);
  return colorBrightness > 200000 ? '#000000' : '#ffffff'
}

const hexToCol = (hex: string, idx: number, mult: number): number => {
  return parseInt(hex.substring(idx, idx + 2), 16) * mult;
}

export const TextRenderer = (props: { text: string, state: MediaEditorSettings['text'] }) => {
  let canvas: HTMLCanvasElement;

  const drawText = (text: string, size: number, font: string, position: number, outline: number, color: string) => {
    const ctx1 = canvas.getContext('2d');
    ctx1.font = `bold ${size}px ${font}`;
    ctx1.lineWidth = 5;
    ctx1.fillStyle = 'white';
    const lines = text.split('\n').filter(Boolean);
    const linesData = lines.map(line => {
      const {width, actualBoundingBoxAscent} = ctx1.measureText(line.trim());
      return {line: line.trim(), width, height: actualBoundingBoxAscent - size / 5}; // subtract if lower bounding is larger of wtf
    });
    const maxWidth = Math.max(...linesData.map(({width}) => width));
    const maxHeight = Math.min(...linesData.map(({height}) => height));
    const fullLinesData = linesData.map(line => {
      if(position === 0) {
        return {...line, x: 0, end: line.width};
      } else if(position === 1) {
        return {...line, x: (maxWidth - line.width) / 2, end: maxWidth - ((maxWidth - line.width) / 2)};
      } else {
        return {...line, x: maxWidth - line.width, end: 0};
      }
    });
    const paddingSize = size;
    canvas.width = maxWidth + size + paddingSize;
    canvas.height = lines.length * (maxHeight + size) + paddingSize;

    const ctx = canvas.getContext('2d');
    ctx.translate(paddingSize / 2, -1);
    ctx.font = `${size}px ${font}`;
    ctx.fillStyle = 'white';

    const radiusSize = size / 2;

    const drawBottomRight = (x: number, y: number, radius: number) => {
      ctx.moveTo(x, y - radius); // first point
      ctx.arcTo(x, y, x + radius, y, radius); // second point and third + radius
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y - radius);
      ctx.closePath();
      ctx.fill();
    }

    const drawBottomLeft = (x: number, y: number, radius: number) => {
      ctx.moveTo(x, y - radius); // first point
      ctx.arcTo(x, y, x - radius, y, radius); // second point and third + radius
      ctx.lineTo(x - radius, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y - radius);
      ctx.closePath();
      ctx.fill();
    }

    const drawTopLeft = (x: number, y: number, radius: number) => {
      ctx.moveTo(x, y + radius); // first point
      ctx.arcTo(x, y, x - radius, y, radius); // second point and third + radius
      ctx.lineTo(x - radius, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + radius);
      ctx.closePath();
      ctx.fill();
    }

    const drawTopRight = (x: number, y: number, radius: number) => {
      ctx.moveTo(x, y + radius); // first point
      ctx.arcTo(x, y, x + radius, y, radius); // second point and third + radius
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + radius);
      ctx.closePath();
      ctx.fill();
    }

    const rectRadius = (radius: number) => {
      return Math.max(-radiusSize, Math.min(radius / 2, radiusSize));
    }

    const fixRadius = (radius: number) => {
      return Math.max(0, radius);
    }

    ctx.fillStyle = getContrastColor(color);
    fullLinesData.forEach((line, idx) => {
      const prev = fullLinesData[idx - 1];
      const next = fullLinesData[idx + 1];

      const leftTopRadius = rectRadius(prev?.x - line.x);
      const rightTopRadius = rectRadius(line.end - prev?.end);

      const leftBottomRadius = rectRadius(next?.x - line.x);
      const rightBottomRadius = rectRadius(line.end - next?.end);

      const radius = [
        prev ? fixRadius(leftTopRadius) : radiusSize,
        prev ? fixRadius(rightTopRadius) : radiusSize,
        next ? fixRadius(rightBottomRadius): radiusSize,
        next ? fixRadius(leftBottomRadius) : radiusSize
      ];

      if(outline === 2) {
        if(leftBottomRadius !== 0) {
          drawBottomLeft(line.x, idx * (maxHeight + paddingSize) + maxHeight + size, fixRadius(-leftBottomRadius));
        }
        if(rightBottomRadius !== 0) {
          drawBottomRight(line.end + size, idx * (maxHeight + paddingSize) + maxHeight + size, fixRadius(-rightBottomRadius));
        }

        if(leftTopRadius !== 0) {
          drawTopLeft(line.x, idx * (maxHeight + paddingSize), fixRadius(-leftTopRadius));
        }
        if(rightTopRadius !== 0) {
          drawTopRight(line.end + size, idx * (maxHeight + paddingSize), fixRadius(-rightTopRadius));
        }

        ctx.roundRect(line.x, idx * (maxHeight + paddingSize), line.width + size, maxHeight + size, radius);
        ctx.closePath();
        ctx.fill();
      }
    });
    fullLinesData.forEach((line, idx) => {
      ctx.fillStyle = color;
      ctx.strokeStyle = outline === 1 ? 'black' : color;
      ctx.lineWidth = 3;
      ctx.strokeText(line.line, line.x + size / 2, idx * (maxHeight + paddingSize) + size);
      ctx.fillText(line.line, line.x + size / 2, idx * (maxHeight + paddingSize) + size);
    });
  }

  const render = () => {
    if(!canvas) return;
    const color = props.state.color;
    drawText(props.text, props.state.size * 2, toolsConfig[props.state.font][0], props.state.align, props.state.outline, typeof color === 'number' ? colors[color] : color);
  }

  createEffect(() => {
    render();
  });

  onMount(() => {
    render();
  });

  return <canvas style={{background: 'transparent'}} ref={canvas}></canvas>
}
