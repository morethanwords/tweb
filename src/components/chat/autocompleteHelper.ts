/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import attachListNavigation from "../../helpers/dom/attachlistNavigation";
import EventListenerBase from "../../helpers/eventListenerBase";
import { isMobile } from "../../helpers/userAgent";
import rootScope from "../../lib/rootScope";
import appNavigationController, { NavigationItem } from "../appNavigationController";
import SetTransition from "../singleTransition";

export default class AutocompleteHelper extends EventListenerBase<{
  hidden: () => void,
  visible: () => void,
}> {
  protected hidden = true;
  protected container: HTMLElement;
  protected list: HTMLElement;
  protected resetTarget: () => void;

  constructor(appendTo: HTMLElement, 
    protected listType: 'xy' | 'x' | 'y', 
    protected onSelect: (target: Element) => boolean | void,
    protected waitForKey?: string
  ) {
    super(false);

    this.container = document.createElement('div');
    this.container.classList.add('autocomplete-helper', 'z-depth-1');

    appendTo.append(this.container);

    this.attachNavigation();
  }

  protected onVisible = () => {
    const list = this.list;
    const {detach, resetTarget} = attachListNavigation({
      list, 
      type: this.listType,
      onSelect: this.onSelect,
      once: true,
      waitForKey: this.waitForKey
    });

    this.resetTarget = resetTarget;
    let navigationItem: NavigationItem;
    if(!isMobile) {
      navigationItem = {
        type: 'autocomplete-helper',
        onPop: () => this.toggle(true),
        noBlurOnPop: true
      };

      appNavigationController.pushItem(navigationItem);
    }

    this.addEventListener('hidden', () => {
      this.resetTarget = undefined;
      list.innerHTML = '';
      detach();

      if(navigationItem) {
        appNavigationController.removeItem(navigationItem);
      }
    }, true);
  };

  protected attachNavigation() {
    this.addEventListener('visible', this.onVisible);
  }

  public toggle(hide?: boolean) {
    hide = hide === undefined ? this.container.classList.contains('is-visible') && !this.container.classList.contains('backwards') : hide;

    if(this.hidden === hide) {
      if(!hide && this.resetTarget) {
        this.resetTarget();
      }

      return;
    }

    this.hidden = hide;
    !this.hidden && this.dispatchEvent('visible'); // fire it before so target will be set
    SetTransition(this.container, 'is-visible', !hide, rootScope.settings.animationsEnabled ? 200 : 0, () => {
      this.hidden && this.dispatchEvent('hidden');
    });
  }
}
