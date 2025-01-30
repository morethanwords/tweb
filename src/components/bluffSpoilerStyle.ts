export default class BluffSpoilerStyle {
  private static style: HTMLStyleElement;
  private static lastDrawTime: number = 0;
  private static DRAW_INTERVAL = 5 * (1000 / 60); // Once in 5 frames (considering 60fps) to avoid performance issues

  private static getStyleSheet() {
    if(this.style) return this.style;

    this.style = document.createElement('style');
    document.head.appendChild(this.style);

    return this.style;
  }

  public static draw(canvas: HTMLCanvasElement) {
    if(this.lastDrawTime + this.DRAW_INTERVAL > performance.now()) return;
    this.lastDrawTime = performance.now();

    const style = this.getStyleSheet();
    const imageURL = canvas.toDataURL();

    style.textContent = `
      .bluff-spoiler {
        mask-image: url(${imageURL});
      }
      .bluff-spoiler--adjusted {
        opacity: 1;
      }
    `;
  }

  public static destroy() {
    this.style.remove();
    this.style = undefined;
  }
}
