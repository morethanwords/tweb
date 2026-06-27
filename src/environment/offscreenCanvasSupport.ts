const IS_OFFSCREEN_CANVAS_SUPPORTED = (() => {
  try {
    if(typeof(OffscreenCanvas) === 'undefined') return false;
    if(typeof(HTMLCanvasElement) !== 'undefined' &&
      !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return false;
    return !!new OffscreenCanvas(1, 1).getContext('2d');
  } catch(err) {
    return false;
  }
})();

export default IS_OFFSCREEN_CANVAS_SUPPORTED;
