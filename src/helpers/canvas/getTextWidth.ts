
let context: CanvasRenderingContext2D;
/**
 * Get the text width
 * @param {string} text
 * @param {string} font
 */
export default function getTextWidth(text: string, font: string) {
  //const perf = performance.now();
  if(!context) {
    const canvas = document.createElement('canvas');
    context = canvas.getContext('2d');
    context.font = font;
  }

  //context.font = font;
  const metrics = context.measureText(text);
  //console.log('getTextWidth perf:', performance.now() - perf);
  return metrics.width;
  //return Math.round(metrics.width);
}
