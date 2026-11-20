import {getEditorShapeGeometry} from '@components/mediaEditor/shapePath';
import type {ResizableLayer} from '@components/mediaEditor/types';

export default function drawShapeLayer(ctx: CanvasRenderingContext2D, layer: ResizableLayer) {
  const info = layer.shapeInfo;
  if(!info) return;
  const geometry = getEditorShapeGeometry(info);
  ctx.save();
  ctx.translate(layer.position[0], layer.position[1]);
  ctx.rotate(layer.rotation);
  ctx.scale(layer.scale, layer.scale);
  ctx.strokeStyle = ctx.fillStyle = info.color;
  ctx.lineWidth = info.strokeWidth;
  ctx.lineCap = ctx.lineJoin = 'round';
  for(const part of geometry.parts) {
    const path = new Path2D(part.path);
    if(part.fill) ctx.fill(path);
    if(part.stroke) ctx.stroke(path);
  }
  ctx.restore();
}
