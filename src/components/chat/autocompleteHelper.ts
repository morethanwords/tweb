/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import attachListNavigation from "../../helpers/dom/attachListNavigation";
import EventListenerBase from "../../helpers/eventListenerBase";
import { safeAssign } from "../../helpers/object";
import { isMobile } from "../../helpers/userAgent";
import rootScope from "../../lib/rootScope";
import appNavigationController, { NavigationItem } from "../appNavigationController";
import SetTransition from "../singleTransition";
import AutocompleteHelperController from "./autocompleteHelperController";

export default class AutocompleteHelper extends EventListenerBase<{
  hidden: () => void,
  visible: () => void,
}> {
  protected hidden = true;
  protected container: HTMLElement;
  protected list: HTMLElement;
  protected resetTarget: () => void;
  protected init?(): void;

  protected controller: AutocompleteHelperController;
  protected listType: 'xy' | 'x' | 'y';
  protected onSelect: (target: Element) => boolean | void;
  protected waitForKey?: string;

  constructor(options: {
    appendTo: HTMLElement,
    controller: AutocompleteHelper['controller'],
    listType: AutocompleteHelper['listType'],
    onSelect: AutocompleteHelper['onSelect'],
    waitForKey?: AutocompleteHelper['waitForKey']
  }) {
    super(false);

    safeAssign(this, options);
    
    this.container = document.createElement('div');
    this.container.classList.add('autocomplete-helper', 'z-depth-1');
    
    options.appendTo.append(this.container);
    
    this.attachNavigation();

    this.controller.addHelper(this);
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

  public toggle(hide?: boolean, fromController = false) {
    if(this.init) {
      return;
    }
    
    if(hide === undefined) {
      hide = this.container.classList.contains('is-visible') && !this.container.classList.contains('backwards');
    }

    if(this.hidden === hide) {
      if(!hide && this.resetTarget) {
        this.resetTarget();
      }

      return;
    }

    this.hidden = hide;

    if(!hide) {
      this.controller.hideOtherHelpers(this);
      this.dispatchEvent('visible'); // fire it before so target will be set
    } else if(!fromController) {
      this.controller.hideOtherHelpers();
    }

    SetTransition(this.container, 'is-visible', !hide, rootScope.settings.animationsEnabled ? 200 : 0, () => {
      this.hidden && this.dispatchEvent('hidden');
    });
  }
}
