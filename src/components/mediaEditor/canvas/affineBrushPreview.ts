import {createEffect, on, onCleanup, untrack} from 'solid-js';
import BrushPainter, {type BrushDrawnLine} from '@components/mediaEditor/canvas/brushPainter';
import type {MediaEditorContextValue} from '@components/mediaEditor/context';

/** Legacy preview only. Rasterize complete source-space outlines (widths,
 * arrowheads, blur/eraser masks) before applying the nonuniform camera. */
export default function createAffineBrushPreview(context: MediaEditorContextValue, target: HTMLCanvasElement, image: HTMLCanvasElement, onDeactivate?: () => void) {
  const {editorState: state, mediaState: media} = context;
  let source: HTMLCanvasElement, backdrop: HTMLCanvasElement;
  let painter: BrushPainter;
  let origin: [number, number] = [0, 0];
  let dimensions = '';
  let density = 1;
  const active = () => !!untrack(() => state.paintPreviewAffine);
  function project() {
    const preview = untrack(() => state.paintPreviewAffine);
    if(!preview || !painter) return;
    const ctx = target.getContext('2d'), m = preview.forward, ratio = state.pixelRatio;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.setTransform(m[0] * ratio, m[1] * ratio, m[2] * ratio, m[3] * ratio, m[4] * ratio, m[5] * ratio);
    ctx.drawImage(source, origin[0], origin[1], source.width / density, source.height / density);
    ctx.restore();
  }
  const translated = (line: BrushDrawnLine): BrushDrawnLine => ({...line,
    size: line.size * density,
    points: line.points.map(p => [(p[0] - origin[0]) * density, (p[1] - origin[1]) * density])});
  function redraw() {
    const preview = untrack(() => state.paintPreviewAffine);
    if(!preview || !state.mediaSize) return;
    const [w, h] = state.mediaSize;
    const bounds = preview.sourceBounds || {x: -w / 2, y: -h / 2, width: w, height: h};
    let padding = Math.max(1, state.currentBrush.size * state.pixelRatio / state.finalTransform.scale * 4);
    for(const line of media.brushDrawnLines) padding = Math.max(padding, line.size * 4);
    padding = Math.ceil(padding);
    const x = Math.floor(bounds.x) - padding, y = Math.floor(bounds.y) - padding;
    const width = Math.ceil(bounds.x + bounds.width) - x + padding;
    const height = Math.ceil(bounds.y + bounds.height) - y + padding;
    // Six source/cache/mask surfaces: bound their allocation independently of
    // source photo size. Density affects raster detail, never affine geometry.
    density = Math.min(1, 2048 / width, 2048 / height, Math.sqrt(1048576 / (width * height)));
    const rasterWidth = Math.ceil(width * density), rasterHeight = Math.ceil(height * density);
    const next = `${x},${y},${width},${height}`;
    if(next !== dimensions) {
      painter?.cancelPreview();
      dimensions = next;
      origin = [x, y];
      source ??= target.ownerDocument.createElement('canvas');
      backdrop ??= target.ownerDocument.createElement('canvas');
      source.width = backdrop.width = rasterWidth;
      source.height = backdrop.height = rasterHeight;
      painter = new BrushPainter({targetCanvas: source, imageCanvas: backdrop, blurAmount: BrushPainter.defaultBlurAmount * density});
    }
    const background = backdrop.getContext('2d');
    background.clearRect(0, 0, rasterWidth, rasterHeight);
    // The existing full source image already has the media flip baked in.
    background.drawImage(image, (-w / 2 - x) * density, (-h / 2 - y) * density, w * density, h * density);
    painter.clear();
    painter.saveLastLine();
    media.brushDrawnLines.forEach(line => painter.drawLine(translated(line)));
    project();
  }
  createEffect(on(() => state.paintPreviewAffine, (value, previous) => {
    if(!value) {
      if(previous) onDeactivate?.();
      return;
    }
    if(!previous || JSON.stringify(value.sourceBounds) !== JSON.stringify(previous.sourceBounds)) redraw();
    else project();
  }));
  onCleanup(() => {
    painter?.cancelPreview();
    if(source) source.width = 0;
    if(backdrop) backdrop.width = 0;
  });
  return {
    active, redraw,
    previewLine(line: BrushDrawnLine) { painter?.previewLine(translated(line)); project(); },
    saveLastLine() { painter?.saveLastLine(); },
    cancelPreview() { painter?.cancelPreview(); project(); },
    finishLine(line: BrushDrawnLine) {
      painter?.previewLine(translated(line), true);
      project();
    }
  };
}
