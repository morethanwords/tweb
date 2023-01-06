/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import attachListNavigation, {ListNavigationOptions} from '../../helpers/dom/attachListNavigation';
import EventListenerBase from '../../helpers/eventListenerBase';
import {IS_MOBILE} from '../../environment/userAgent';
import rootScope from '../../lib/rootScope';
import appNavigationController, {NavigationItem} from '../appNavigationController';
import SetTransition from '../singleTransition';
import AutocompleteHelperController from './autocompleteHelperController';
import safeAssign from '../../helpers/object/safeAssign';

export default class AutocompleteHelper extends EventListenerBase<{
  hidden: () => void,
  visible: () => void,
  hiding: () => void
}> {
  protected hidden = true;
  protected container: HTMLElement;
  protected list: HTMLElement;
  protected resetTarget: () => void;
  protected attach: () => void;
  protected detach: () => void;
  protected init?(): void;

  protected controller: AutocompleteHelperController;
  protected listType: 'xy' | 'x' | 'y';
  protected onSelect: ListNavigationOptions['onSelect'];
  protected waitForKey?: string[];

  protected navigationItem: NavigationItem;

  constructor(options: {
    appendTo: HTMLElement,
    controller?: AutocompleteHelper['controller'],
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

    this.controller && this.controller.addHelper(this);
  }

  public toggleListNavigation(enabled: boolean) {
    if(enabled) {
      this.attach && this.attach();
    } else {
      this.detach && this.detach();
    }
  }

  protected onVisible = () => {
    if(this.detach) { // it can be so because 'visible' calls before animation's end
      this.detach();
    }

    const list = this.list;
    const {attach, detach, resetTarget} = attachListNavigation({
      list,
      type: this.listType,
      onSelect: this.onSelect,
      once: true,
      waitForKey: this.waitForKey
    });

    this.attach = attach;
    this.detach = detach;
    this.resetTarget = resetTarget;
    if(!IS_MOBILE && !this.navigationItem) {
      this.navigationItem = {
        type: 'autocomplete-helper',
        onPop: () => {
          this.navigationItem = undefined;
          this.toggle(true);
        },
        noBlurOnPop: true
      };

      appNavigationController.pushItem(this.navigationItem);
    }

    this.addEventListener('hidden', () => {
      this.resetTarget = undefined;
      this.attach = undefined;
      this.detach = undefined;

      list.innerHTML = '';
      detach();

      if(this.navigationItem) {
        appNavigationController.removeItem(this.navigationItem);
        this.navigationItem = undefined;
      }
    }, {once: true});
  };

  protected attachNavigation() {
    this.addEventListener('visible', this.onVisible);
  }

  public toggle(hide?: boolean, fromController = false, skipAnimation?: boolean) {
    if(this.init) {
      return;
    }

    if(hide === undefined) {
      hide = this.container.classList.contains('is-visible') && !this.container.classList.contains('backwards');
    }

    if(this.hidden === hide) {
      if(!hide) {
        this.dispatchEvent('visible'); // reset target and listener
      }

      return;
    }

    this.hidden = hide;

    if(!hide) {
      this.controller && this.controller.hideOtherHelpers(this);
      this.dispatchEvent('visible'); // fire it before so target will be set
    } else {
      if(this.navigationItem) {
        appNavigationController.removeItem(this.navigationItem);
        this.navigationItem = undefined;
      }

      if(!fromController && this.controller) {
        this.controller.hideOtherHelpers();
      }

      if(this.detach) { // force detach here
        this.detach();
      }
    }

    const useRafs = this.controller || hide ? 0 : 2;

    if(hide) {
      this.dispatchEvent('hiding');
    }

    SetTransition({
      element: this.container,
      className: 'is-visible',
      forwards: !hide,
      duration: rootScope.settings.animationsEnabled && !skipAnimation ? 300 : 0,
      onTransitionEnd: () => {
        this.hidden && this.dispatchEvent('hidden');
      },
      useRafs
    });
  }
}
