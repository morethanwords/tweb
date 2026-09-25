export default class CustomEmojiElement extends HTMLElement {
  public placeholder?: HTMLImageElement;

  public get docId() {
    return this.dataset.docId;
  }

  public set docId(value: string) {
    this.dataset.docId = value;
  }

  public static create(docId?: string) {
    const element = document.createElement('span') as CustomEmojiElement;
    if(docId) element.dataset.docId = docId;
    element.destroy = () => undefined;
    return element;
  }

  public destroy() {}
}
