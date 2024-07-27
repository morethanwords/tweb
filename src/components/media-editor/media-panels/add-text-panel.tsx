import {createEffect, createSignal, onMount, Signal} from 'solid-js';

export const AddTextPanel = (props: {editingText: Signal<any>}) => {
  console.info('ADD TEXT PANEL');
  const [editingText, setEditingText] = props.editingText;
  let content: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  const [newText, setNewText] = createSignal('_');

  const drawText = (text: string, size: number, font: string, position: 0 | 1 | 2) => {
    const ctx1 = canvas.getContext('2d');
    ctx1.font = `${size}px ${font}`;
    ctx1.lineWidth = 5;
    ctx1.fillStyle = 'white';
    const lines = text.split('\n').filter(Boolean);
    const linesData = lines.map(line => {
      const {actualBoundingBoxRight, actualBoundingBoxLeft, actualBoundingBoxAscent, actualBoundingBoxDescent} = ctx1.measureText(line.trim());
      return {line: line.trim(), width: actualBoundingBoxRight + actualBoundingBoxLeft, height: actualBoundingBoxAscent - size / 5}; // subtract if lower bounding is larger of wtf
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
    canvas.width = maxWidth + size + 2;
    canvas.height = 600;

    const ctx = canvas.getContext('2d');
    ctx.translate(-1, -1);
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

    ctx.fillStyle = 'white';
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
    });
    fullLinesData.forEach((line, idx) => {
      ctx.fillStyle = 'red';
      ctx.fillText(line.line, line.x + size / 2, idx * (maxHeight + paddingSize) + size);
    });
  }

  onMount(() => {
    setTimeout(() => {
      content.focus();
    }, 150);
    console.info('MOUNT', canvas);

    // canvas.width = 600;
    // canvas.height = 600;
    drawText('hello sdkjfhgdfsdfssdkjh ired \n fuck olfhslidhaslff1hl 1ff \n browtfiamsuposetodo\n dsfkgadsfklgdblfasy;adisy \n fuck you sfdffmean', 40, 'serif', 0);
  });

  createEffect(() => {
    drawText(newText(), 40, 'serif', 2);
  })

  window.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    content.focus();
  })

  window.addEventListener('key', ev => {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    content.focus();
  })

  return <div onclick={ev => {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    setEditingText(false);
  }} classList={{'media-paint-panel': true, 'media-editor-stickers-panel': true, 'edit-text-panel': true}}>
    <div class='text-edit' ref={content} style={{'color': 'white', 'white-space': 'pre-wrap', 'min-width': '100px', 'min-height': '100px'}}
      contentEditable={true}
      onKeyDown={key => console.info(key)}
      onInput={() => setNewText(content.innerText)}>
      {setNewText()}
    </div>
    <canvas style={{background: 'transparent'}} ref={canvas}></canvas>
  </div>
};
