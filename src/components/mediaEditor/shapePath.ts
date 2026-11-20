import type {ShapeLayerInfo} from '@components/mediaEditor/types';
import {desktopArrowPoints} from '@components/mediaEditor/native/desktopShapeGeometry';

/** Source-space frame: native strokes are inset; legacy strokes extend outside it. */
export function getEditorShapeGeometry(info: ShapeLayerInfo) {
  const arrow = info.geometryVersion === 'desktop-arrow-v1' && info.shape === 'arrow';
  const native = arrow || info.geometryVersion === 'desktop-v1' && info.shape !== 'arrow';
  const padding = native ? 0 : info.strokeWidth / 2;
  const parts = arrow ? getDesktopArrowPaths(info) : [{
    path: native ? getDesktopShapePath(info) : getEditorShapePath(info),
    fill: info.filled,
    stroke: true
  }];
  return {
    path: parts[0].path,
    parts,
    previewBounds: {
      x: -info.width / 2 - padding,
      y: -info.height / 2 - padding,
      width: info.width + padding * 2,
      height: info.height + padding * 2
    }
  };
}

/** ItemShape::arrowPoints/arrowShaftPath/arrowHeadPath, local media coordinates. */
function getDesktopArrowPaths(info: ShapeLayerInfo) {
  const {start, control, end, side} = desktopArrowPoints(info);
  const deltaX = end[0] - control[0], deltaY = end[1] - control[1];
  const length = Math.hypot(deltaX, deltaY);
  const shaft = {path: `M ${start[0]} ${start[1]} Q ${control[0]} ${control[1]} ${end[0]} ${end[1]}`, fill: false, stroke: true};
  if(length <= 0) return [shaft];
  const fx = deltaX / length, fy = deltaY / length;
  const ax = end[0] + fx * side / 2, ay = end[1] + fy * side / 2;
  const cos = Math.cos(Math.PI / 6), sin = Math.sin(Math.PI / 6);
  const head = `M ${ax} ${ay} L ${ax - (fx * cos - fy * sin) * side} ${ay - (fx * sin + fy * cos) * side} L ${ax - (fx * cos + fy * sin) * side} ${ay - (-fx * sin + fy * cos) * side} Z`;
  // paint() retains its QPen for the head: both its fill and outline are unconditional.
  return [shaft, {path: head, fill: true, stroke: true}];
}

/** ItemShape::shapeRect/shapePath. Equivalent outline, not Qt-identical rasterization. */
function getDesktopShapePath({shape, width, height, strokeWidth, shapeFlip}: ShapeLayerInfo): string {
  const w = Math.max(width - strokeWidth, 1), h = Math.max(height - strokeWidth, 1);
  const x = w / 2, y = h / 2;
  if(shape === 'circle') {
    return getEditorShapePath({shape, width: w, height: h});
  }
  if(shape === 'star') {
    const outer = Math.min(w / 1.902113, h / 1.809017);
    const cy = outer - 1.809017 * outer / 2;
    return Array.from({length: 10}, (_, i) => {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const radius = outer * (i % 2 ? .4316 : 1);
      return `${i ? 'L' : 'M'} ${Math.cos(angle) * radius} ${cy + Math.sin(angle) * radius}`;
    }).join(' ') + ' Z';
  }
  const bodyHeight = shape === 'bubble' ? h * 2 / 2.25 : h;
  const bottom = -y + bodyHeight;
  const r = .234 * Math.min(w, bodyHeight) / 2;
  let tail = '';
  if(shape === 'bubble') {
    const cy = -y + bodyHeight / 2;
    const tx = (shapeFlip ? -1 : 1) * .75 * w / 2, dy = y - cy;
    const length = Math.hypot(tx, dy);
    const halfBase = Math.min(w, bodyHeight) / 4;
    const nx = -dy / length * halfBase, ny = tx / length * halfBase;
    const intersections = [1, -1].map(sign => {
      const px = sign * nx, py = cy + sign * ny;
      return px + (tx - px) * (bottom - py) / (y - py);
    }).sort((a, b) => a - b);
    // The triangle lies in |x| <= .375w, while the corners start at >= .383w.
    // Both edges therefore cross the straight bottom: splice its outer union only.
    tail = ` H ${intersections[1]} L ${tx} ${y} L ${intersections[0]} ${bottom}`;
  }
  return `M ${-x + r} ${-y} H ${x - r} A ${r} ${r} 0 0 1 ${x} ${-y + r} V ${bottom - r} A ${r} ${r} 0 0 1 ${x - r} ${bottom}${tail} H ${-x + r} A ${r} ${r} 0 0 1 ${-x} ${bottom - r} V ${-y + r} A ${r} ${r} 0 0 1 ${-x + r} ${-y} Z`;
}

/** Frozen legacy geometry: saved shapes and Android retain these exact paths. */
export function getEditorShapePath({shape, width, height}: Pick<ShapeLayerInfo, 'shape' | 'width' | 'height'>): string {
  const x = width / 2, y = height / 2;
  switch(shape) {
    case 'circle':
      return `M ${-x} 0 A ${x} ${y} 0 1 0 ${x} 0 A ${x} ${y} 0 1 0 ${-x} 0 Z`;
    case 'rectangle':
    case 'bubble': {
      // Android's rounded box and lower-right bubble corner, expressed as one outline.
      const r = Math.min(32, x, y);
      const bottom = shape === 'bubble' ? y * .8 : y;
      const path = `M ${-x + r} ${-y} H ${x - r} Q ${x} ${-y} ${x} ${-y + r} V ${bottom - r} Q ${x} ${bottom} ${x - r} ${bottom}`;
      const tail = shape === 'bubble' ? ` L ${x * .8} ${y} L ${x * .15} ${bottom}` : '';
      return `${path}${tail} H ${-x + r} Q ${-x} ${bottom} ${-x} ${bottom - r} V ${-y + r} Q ${-x} ${-y} ${-x + r} ${-y} Z`;
    }
    case 'star': {
      // ShaderSet.java's five-point SDF: acs=(cos(pi/5),sin(pi/5)), ecs=(cos(1),sin(1)).
      const inner = Math.cos(Math.PI / 5) - Math.sin(Math.PI / 5) / Math.tan(1);
      return Array.from({length: 10}, (_, i) => {
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const radius = i % 2 ? inner : 1;
        return `${i ? 'L' : 'M'} ${Math.cos(angle) * x * radius} ${Math.sin(angle) * y * radius}`;
      }).join(' ') + ' Z';
    }
    case 'arrow':
      return `M ${-x} ${-y * .2} H 0 V ${-y} L ${x} 0 L 0 ${y} V ${y * .2} H ${-x} Z`;
  }
}
