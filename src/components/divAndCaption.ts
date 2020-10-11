export default class DivAndCaption<T> {
  public container: HTMLElement;
  public border: HTMLElement;
  public content: HTMLElement;
  public title: HTMLElement;
  public subtitle: HTMLElement;

  constructor(protected className: string, public fill: T) {
    this.container = document.createElement('div');
    this.container.className = className;

    this.border = document.createElement('div');
    this.border.classList.add(className + '-border');
    
    this.content = document.createElement('div');
    this.content.classList.add(className + '-content');

    this.title = document.createElement('div');
    this.title.classList.add(className + '-title');

    this.subtitle = document.createElement('div');
    this.subtitle.classList.add(className + '-subtitle');

    this.content.append(this.title, this.subtitle);
    this.container.append(this.border, this.content);
  }
}