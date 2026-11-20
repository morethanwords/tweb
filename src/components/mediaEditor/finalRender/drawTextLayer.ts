import {MediaEditorContextValue} from '@components/mediaEditor/context';
import {fontInfoMap} from '@components/mediaEditor/utils';
import getTextAppearance from '@components/mediaEditor/textAppearance';
import {getEditorFontCss} from '@components/mediaEditor/fonts';
import {ResizableLayer} from '@components/mediaEditor/types';

export default function drawTextLayer(
  context: MediaEditorContextValue,
  ctx: CanvasRenderingContext2D,
  layer: ResizableLayer,
  densityAware = true
) {
  if(layer.type !== 'text') return;

  const {editorState: {pixelRatio}} = context;

  const renderingInfo = {...layer.textRenderingInfo};
  const scale = layer.scale * (densityAware ? pixelRatio : 1);
  renderingInfo.height *= scale;
  renderingInfo.width *= scale;
  renderingInfo.lines = renderingInfo.lines.map((line) => ({
    ...line,
    height: line.height * scale,
    left: line.left * scale,
    right: line.right * scale
  }));

  if(renderingInfo.path) {
    const newPath = [...renderingInfo.path];
    function multiply(i: number) {
      newPath[i] = (newPath[i] as number) * scale;
    }
    newPath.forEach((part, i) => {
      if(part === 'M' || part === 'L') {
        multiply(i + 1);
        multiply(i + 2);
      } else if(part === 'A') {
        multiply(i + 1);
        multiply(i + 2);
        multiply(i + 6);
        multiply(i + 7);
      }
    });
    renderingInfo.path = newPath;
  }

  ctx.save();
  ctx.translate(layer.position[0], layer.position[1]);
  ctx.rotate(layer.rotation);

  let prevY = -renderingInfo.height / 2;
  const boxLeft = -renderingInfo.width / 2;
  const fontInfo = fontInfoMap[layer.textInfo.font];
  const appearance = getTextAppearance(layer.textInfo);

  if(appearance.backgroundColor && renderingInfo.path) {
    ctx.translate(boxLeft, prevY);

    ctx.fillStyle = appearance.backgroundColor;
    const path = new Path2D(renderingInfo.path.join(' '));

    ctx.fill(path);
    ctx.translate(-boxLeft, -prevY);
  }

  renderingInfo.lines.forEach((line) => {
    const yOffset = line.height * fontInfo.baseline;
    let xOffset = 0.2 * layer.textInfo.size;
    if(appearance.backgroundColor) xOffset = 0.3 * layer.textInfo.size;

    ctx.font = getEditorFontCss(fontInfo, layer.textInfo.size);

    const x = boxLeft + xOffset + line.left,
      y = prevY + yOffset;

    if(appearance.outlineColor) {
      ctx.lineWidth = layer.textInfo.size * 0.15;
      ctx.strokeStyle = appearance.outlineColor;
      ctx.strokeText(line.content, x, y);
    }
    ctx.fillStyle = appearance.textColor;
    ctx.fillText(line.content, x, y);
    prevY += line.height;
  });

  ctx.restore();
}
