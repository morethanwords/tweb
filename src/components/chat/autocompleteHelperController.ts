/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {getMiddleware} from '../../helpers/middleware';
import AutocompleteHelper from './autocompleteHelper';

export default class AutocompleteHelperController {
  private helpers: Set<AutocompleteHelper> = new Set();
  private middleware = getMiddleware();
  /* private tempId = 0;

  public incrementToggleCount() {
    return ++this.tempId;
  }

  public getToggleCount() {
    return this.tempId;
  } */

  public toggleListNavigation(enabled: boolean) {
    for(const helper of this.helpers) {
      helper.toggleListNavigation(enabled);
    }
  }

  public getMiddleware() {
    this.middleware.clean();
    return this.middleware.get();
  }

  public addHelper(helper: AutocompleteHelper) {
    this.helpers.add(helper);
  }

  public hideOtherHelpers(preserveHelper?: AutocompleteHelper) {
    this.helpers.forEach((helper) => {
      if(helper !== preserveHelper) {
        helper.toggle(true, true);
      }
    });

    if(!preserveHelper) {
      this.middleware.clean();
    }
  }
}
