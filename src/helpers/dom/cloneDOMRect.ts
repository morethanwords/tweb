export default function cloneDOMRect(rect: DOMRect): DOMRectEditable {
  return {
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left
  };
}
