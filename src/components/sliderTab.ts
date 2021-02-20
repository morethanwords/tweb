import ButtonIcon from "./buttonIcon";
import Scrollable from "./scrollable";
import SidebarSlider from "./slider";

export interface SliderTab {
  onOpen?: () => void,
  onOpenAfterTimeout?: () => void,
  onClose?: () => void,
  onCloseAfterTimeout?: () => void
}

export default class SliderSuperTab implements SliderTab {
  public container: HTMLElement;

  public header: HTMLElement;
  public closeBtn: HTMLElement;
  public title: HTMLElement;

  public content: HTMLElement;
  public scrollable: Scrollable;

  constructor(protected slider: SidebarSlider, protected destroyable = false) {
    this.container = document.createElement('div');
    this.container.classList.add('sidebar-slider-item');

    // * Header
    this.header = document.createElement('div');
    this.header.classList.add('sidebar-header');

    this.closeBtn = ButtonIcon('arrow_back sidebar-close-button', {noRipple: true});
    this.title = document.createElement('div');
    this.title.classList.add('sidebar-header__title');
    this.header.append(this.closeBtn, this.title);

    // * Content
    this.content = document.createElement('div');
    this.content.classList.add('sidebar-content');

    this.scrollable = new Scrollable(this.content, undefined, undefined, true);

    this.container.append(this.header, this.content);

    this.slider.addTab(this);
  }

  public close() {
    return this.slider.closeTab(this);
  }

  public async open(...args: any[]) {
    if(this.init) {
      const result = this.init();
      this.init = null;
      if(result instanceof Promise) {
        await result;
      }
    }

    return this.slider.selectTab(this);
  }

  protected init(): Promise<any> | any {

  }

  // * fix incompability
  public onOpen() {

  }

  public onCloseAfterTimeout() {
    if(this.destroyable) { // ! WARNING, пока что это будет работать только с самой последней внутренней вкладкой !
      this.slider.tabs.delete(this);
      this.container.remove();
    }
  }
}
