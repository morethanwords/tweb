/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import EventListenerBase, {EventListenerListeners} from '../helpers/eventListenerBase';
import ListenerSetter from '../helpers/listenerSetter';
import {getMiddleware, MiddlewareHelper} from '../helpers/middleware';
import noop from '../helpers/noop';
import {AppManagers} from '../lib/appManagers/managers';
import {i18n, LangPackKey} from '../lib/langPack';
import ButtonIcon from './buttonIcon';
import Scrollable from './scrollable';
import SidebarSlider from './slider';

export interface SliderSuperTabConstructable<T extends SliderSuperTab = any> {
  new(slider: SidebarSlider, destroyable: boolean): T;
}

export interface SliderSuperTabEventableConstructable {
  new(slider: SidebarSlider, destroyable: boolean): SliderSuperTabEventable;
}

export default class SliderSuperTab {
  public static getInitArgs?(...args: any[]): any;

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
  public middlewareHelper: MiddlewareHelper;

  public isConfirmationNeededOnClose: () => void | boolean | Promise<any>; // should return boolean instantly or `Promise` from `confirmationPopup`

  constructor(slider: SidebarSlider, destroyable?: boolean) {
    this._constructor(slider, destroyable);
  }

  public _constructor(slider: SidebarSlider, destroyable = true): any {
    this.slider = slider;
    this.middlewareHelper = slider ? slider.getMiddleware().create() : getMiddleware();
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
    this.scrollable.attachBorderListeners(this.container);

    this.container.append(this.header, this.content);

    this.slider?.addTab(this);

    this.listenerSetter = new ListenerSetter();
  }

  public close() {
    return this.slider.closeTab(this);
  }

  public async open(...args: Parameters<typeof this['init']>) {
    if(this.init) {
      try {
        const result = this.init(...args);
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

  public init(...args: any[]): Promise<any> | any {

  }

  protected onOpen() {}
  protected onOpenAfterTimeout() {}
  protected onClose() {}

  protected onCloseAfterTimeout() {
    if(this.destroyable) { // ! WARNING, пока что это будет работать только с самой последней внутренней вкладкой !
      this.slider?.deleteTab(this);
      this.container.remove();
      this.scrollable.destroy();
      this.listenerSetter?.removeAll();
      this.middlewareHelper?.destroy();
    }
  }

  protected setTitle(key: LangPackKey) {
    this.title.replaceChildren(i18n(key));
  }
}

export class SliderSuperTabEventable<T extends EventListenerListeners = {}> extends SliderSuperTab {
  public eventListener: EventListenerBase<{
    destroy: () => void | Promise<any>,
    destroyAfter: (promise: Promise<void>) => void,
    close: () => void
  } & T>;

  constructor(slider: SidebarSlider) {
    super(slider);
    this.eventListener = new EventListenerBase();
  }

  onClose() {
    // @ts-ignore
    this.eventListener.dispatchEvent('close');
  }

  onCloseAfterTimeout() {
    // @ts-ignore
    const results = this.eventListener.dispatchResultableEvent('destroy');
    // @ts-ignore
    this.eventListener.dispatchEvent('destroyAfter', Promise.all(results).then(noop, noop));
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
