/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import EventListenerBase from "../../helpers/eventListenerBase";
import rootScope from "../../lib/rootScope";
import SetTransition from "../singleTransition";

export default class AutocompleteHelper extends EventListenerBase<{
  hidden: () => void,
  visible: () => void,
}> {
  protected container: HTMLElement;

  constructor(appendTo: HTMLElement) {
    super(false);

    this.container = document.createElement('div');
    this.container.classList.add('autocomplete-helper', 'z-depth-1');

    appendTo.append(this.container);
  }

  public toggle(hide?: boolean) {
    hide = hide === undefined ? this.container.classList.contains('is-visible') : hide;
    SetTransition(this.container, 'is-visible', !hide, rootScope.settings.animationsEnabled ? 200 : 0, () => {
      this.dispatchEvent(hide ? 'hidden' : 'visible');
    });
  }
}
