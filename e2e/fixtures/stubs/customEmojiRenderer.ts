export class CustomEmojiRendererElement extends HTMLElement {
  public static create() {
    const element = document.createElement('div') as unknown as CustomEmojiRendererElement;
    element.add = () => undefined;
    element.destroy = () => undefined;
    element.forceRender = () => undefined;
    return element;
  }

  public add() {}
  public destroy() {}
  public forceRender() {}
}
