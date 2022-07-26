/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import EventListenerBase from "../helpers/eventListenerBase";
import ListenerSetter from "../helpers/listenerSetter";
import { AppManagers } from "../lib/appManagers/managers";
import { i18n, LangPackKey } from "../lib/langPack";
import ButtonIcon from "./buttonIcon";
import Scrollable from "./scrollable";
import SidebarSlider from "./slider";

export interface SliderTab {
  onOpen?: () => void,
  onOpenAfterTimeout?: () => void,
  onClose?: () => void,
  onCloseAfterTimeout?: () => void
}

export interface SliderSuperTabConstructable<T extends SliderSuperTab = any> {
  new(slider: SidebarSlider, destroyable: boolean): T;
}

export interface SliderSuperTabEventableConstructable {
  new(slider: SidebarSlider, destroyable: boolean): SliderSuperTabEventable;
}

export default class SliderSuperTab implements SliderTab {
  public container: HTMLElement;

  public header: HTMLElement;
  public closeBtn: HTMLElement;
  public title: HTMLElement;

  public content: HTMLElement;
  public scrollable: Scrollable;

  public slider: SidebarSlider;
  public destroyable: boolean;
  public listenerSetter: ListenerSetter;

  public managers: AppManagers;

  constructor(slider: SidebarSlider, destroyable?: boolean) {
    this._constructor(slider, destroyable);
  }

  public _constructor(slider: SidebarSlider, destroyable = true): any {
    this.slider = slider;
    this.destroyable = destroyable;

    this.container = document.createElement('div');
    this.container.classList.add('tabs-tab', 'sidebar-slider-item');

    // * Header
    this.header = document.createElement('div');
    this.header.classList.add('sidebar-header');

    this.closeBtn = ButtonIcon('left sidebar-close-button', {noRipple: true});
    this.title = document.createElement('div');
    this.title.classList.add('sidebar-header__title');
    this.header.append(this.closeBtn, this.title);

    // * Content
    this.content = document.createElement('div');
    this.content.classList.add('sidebar-content');

    this.scrollable = new Scrollable(this.content, undefined, undefined, true);

    this.container.append(this.header, this.content);

    if(this.slider) {
      this.slider.addTab(this);
    }
    
    this.listenerSetter = new ListenerSetter();
  }

  public close() {
    return this.slider.closeTab(this);
  }

  public async open(...args: any[]) {
    if(this.init) {
      try {
        const result = this.init();
        this.init = null;

        if(result instanceof Promise) {
          await result;
        }
      } catch(err) {
        console.error('open tab error', err);
      }
    }

    this.slider.selectTab(this);
  }

  protected init(): Promise<any> | any {

  }

  public onCloseAfterTimeout() {
    if(this.destroyable) { // ! WARNING, пока что это будет работать только с самой последней внутренней вкладкой !
      this.slider.tabs.delete(this);
      this.container.remove();
      this.scrollable.destroy();
      this.listenerSetter?.removeAll();
    }
  }

  protected setTitle(key: LangPackKey) {
    this.title.innerHTML = '';
    this.title.append(i18n(key));
  }
}

export class SliderSuperTabEventable extends SliderSuperTab {
  public eventListener: EventListenerBase<{
    destroy: () => void
  }>;

  constructor(slider: SidebarSlider) {
    super(slider);
    this.eventListener = new EventListenerBase();
  }

  onCloseAfterTimeout() {
    this.eventListener.dispatchEvent('destroy');
    this.eventListener.cleanup();
    return super.onCloseAfterTimeout();
  }
}

/* // @ts-ignore
interface SliderSuperEventsTab extends SliderSuperTab, EventListenerBase<{}> {
  superConstructor: (...args: any[]) => any;
}
class SliderSuperEventsTab implements SliderSuperEventsTab {
  constructor(slider: SidebarSlider) {
    this.superConstructor([slider, true]);
  }
}
applyMixins(SliderSuperEventsTab, [SliderSuperTab, EventListenerBase]);

(window as any).lol = SliderSuperEventsTab

export {SliderSuperEventsTab}; */
