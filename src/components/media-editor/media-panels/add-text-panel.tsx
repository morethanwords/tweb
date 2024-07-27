import {createSignal, onMount, Show, Signal} from 'solid-js';
import {max} from 'big-integer';

export const AddTextPanel = (props: {editingText: Signal<any>}) => {
  console.info('ADD TEXT PANEL');
  const [editingText, setEditingText] = props.editingText;
  let content: HTMLDivElement;
  let canvas: HTMLCanvasElement;

  const [newText, setNewText] = createSignal('');
  const drawText = (text: string, size: number, font: string, position: 0 | 1 | 2) => {
    const ctx1 = canvas.getContext('2d');
    ctx1.font = `${size}px ${font}`;
    ctx1.lineWidth = 5;
    ctx1.fillStyle = 'white';
    const lines = text.split('\n');
    const linesData = lines.map(line => {
      const newLine = line.trim();
      const {actualBoundingBoxRight, actualBoundingBoxLeft, actualBoundingBoxAscent, actualBoundingBoxDescent} = ctx1.measureText(newLine);
      return {line: newLine, width: actualBoundingBoxRight + actualBoundingBoxLeft, height: actualBoundingBoxAscent + actualBoundingBoxDescent};
    });
    console.info(linesData);
    const maxWidth = Math.max(...linesData.map(({width}) => width));
    const maxHeight = Math.max(...linesData.map(({height}) => height));
    // mb same for height
    const fullLinesData = linesData.map(line => {
      if(position === 0) {
        return {...line, x: 0, end: maxWidth - line.width};
      } else if(position === 1) {
        return {...line, x: (maxWidth - line.width) / 2, end: maxWidth - ((maxWidth - line.width) / 2)};
      } else {
        return {...line, x: maxWidth - line.width, end: 0};
      }
    });
    const paddingSize = size;
    canvas.width = 600; // paddingSize + maxWidth;
    canvas.height = 600; // fullLinesData.length * (maxHeight + paddingSize);

    const ctx = canvas.getContext('2d');
    ctx.font = `${size}px ${font}`;
    ctx.fillStyle = 'white';
    ctx.moveTo(0, 0);

    const radiusSize = size / 2;

    const drawBottomRight = (x: number, y: number, radius: number) => {
      // ctx.beginPath();
      ctx.moveTo(x, y - radius); // first point
      ctx.arcTo(x, y, x + radius, y, radius); // second point and third + radius
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y - radius);
      ctx.closePath();
      ctx.fill();
    }

    const drawBottomLeft = (x: number, y: number, radius: number) => {
      // ctx.beginPath();
      ctx.moveTo(x, y - radius); // first point
      ctx.arcTo(x, y, x - radius, y, radius); // second point and third + radius
      ctx.lineTo(x - radius, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y - radius);
      ctx.closePath();
      ctx.fill();
    }

    const drawTopLeft = (x: number, y: number, radius: number) => {
      // ctx.beginPath();
      ctx.moveTo(x, y + radius); // first point
      ctx.arcTo(x, y, x - radius, y, radius); // second point and third + radius
      ctx.lineTo(x - radius, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + radius);
      ctx.closePath();
      ctx.fill();
    }

    const drawTopRight = (x: number, y: number, radius: number) => {
      // ctx.beginPath();
      ctx.moveTo(x, y + radius); // first point
      ctx.arcTo(x, y, x + radius, y, radius); // second point and third + radius
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + radius);
      ctx.closePath();
      ctx.fill();
    }

    const rectRadius = (radius: number) => {
      return Math.min(radius / 2, radiusSize);
    }

    const fixRadius = (radius: number) => {
      return Math.max(0, radius);
    }

    ctx.translate(50, 50);

    fullLinesData.forEach((line, idx) => {
      const first = idx === 0;
      const last = idx === fullLinesData.length - 1;
      ctx.fillStyle = 'white';
      let radius = [];
      if(first && last) {
        radius = [radiusSize];
      } else if(first) {
        const next = fullLinesData[idx + 1];
        const rightBottomOffset = line.end - next.end;
        const leftBottomOffset = next.x - line.x;
        const leftBottomRadius = rectRadius(leftBottomOffset);
        const rightBottomRadius = rectRadius(rightBottomOffset);
        radius = [radiusSize, radiusSize, fixRadius(rightBottomRadius), fixRadius(leftBottomRadius)];

        if(leftBottomRadius !== 0) {
          drawBottomLeft(line.x, idx * (maxHeight + paddingSize) + maxHeight + size, fixRadius(-leftBottomRadius));
        }
        if(rightBottomRadius !== 0) {
          drawBottomRight(line.end + size, idx * (maxHeight + paddingSize) + maxHeight + size, fixRadius(-rightBottomRadius));
        }
      } else if(last) {
        const prev = fullLinesData[idx - 1];
        const topLeftOffset = prev.x - line.x;
        const topRightOffset = line.end - prev.end;
        const leftTopRadius = rectRadius(topLeftOffset);
        const rightTopRadius = rectRadius(topRightOffset);
        radius = [fixRadius(leftTopRadius), fixRadius(rightTopRadius), radiusSize, radiusSize];

        if(leftTopRadius !== 0) {
          drawTopLeft(line.x, idx * (maxHeight + paddingSize), fixRadius(-leftTopRadius));
        }
        if(rightTopRadius !== 0) {
          drawTopRight(line.end + size, idx * (maxHeight + paddingSize), fixRadius(-rightTopRadius));
        }
      } else {
        const prev = fullLinesData[idx - 1];
        const next = fullLinesData[idx + 1];

        const rightBottomOffset = line.end - next.end;
        const leftBottomOffset = next.x - line.x;
        const leftBottomRadius = rectRadius(leftBottomOffset);
        const rightBottomRadius = rectRadius(rightBottomOffset);

        const topLeftOffset = prev.x - line.x;
        const topRightOffset = line.end - prev.end;
        const leftTopRadius = rectRadius(topLeftOffset);
        const rightTopRadius = rectRadius(topRightOffset);

        radius = [fixRadius(leftTopRadius), fixRadius(rightTopRadius), fixRadius(rightBottomRadius), fixRadius(leftBottomRadius)];

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
      }
      ctx.roundRect(line.x, idx * (maxHeight + paddingSize), line.width + size, maxHeight + size, radius);
      ctx.closePath();
      ctx.fill();
    });
    fullLinesData.forEach((line, idx) => {
      ctx.fillStyle = 'red';
      ctx.fillText(line.line, line.x + size / 2, idx * (maxHeight + paddingSize) + size * 1.25);
    });
  }

  onMount(() => {
    /* setTimeout(() => {
      content.focus();
    }, 150); */
    console.info('MOUNT', canvas);

    canvas.width = 600;
    canvas.height = 600;
    drawText('hello sdkjfhgsdkjh ired \n fuck olfhslidhaslff1hl 1ff \n browtfiamsuposetodo\n dsfkgadsfklgdblfasy;adisy \n fuck you sfdffmean', 40, 'serif', 1);
  })

  /* window.addEventListener('keypress', ev => {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    console.info('evev', ev);
  }) */

  /* const old = document.body.onkeypress;
  document.body.onkeypress = ev => {
    console.info('aaaa', ev);
  } */

  // lets tye to hide the contenteditable (but focus on it)
  // maybe not hide all, keep the backdrop idk
  return <div classList={{'media-paint-panel': true, 'media-editor-stickers-panel': true, 'edit-text-panel': true}}>
    { /* <input value={newText()}
        onInput={(e) => setNewText(e.currentTarget.value)} /> */ }
    <div class='text-edit' ref={content} style={{'color': 'white', 'white-space': 'pre-wrap', 'min-width': '100px', 'min-height': '100px'}}
      contentEditable={true}
      onKeyDown={key => console.info(key)}
      onInput={() => setNewText(content.innerText)}>
      {setNewText()}
    </div>
    <canvas style={{background: 'black'}} ref={canvas}></canvas>
  </div>
};
