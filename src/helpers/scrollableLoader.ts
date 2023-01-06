/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Scrollable from '../components/scrollable';
import safeAssign from './object/safeAssign';

export default class ScrollableLoader {
  public loading = false;
  private scrollable: Scrollable;
  private getPromise: () => Promise<boolean>;
  private promise: Promise<any>;
  private loaded = false;

  constructor(options: {
    scrollable: ScrollableLoader['scrollable'],
    getPromise: ScrollableLoader['getPromise']
  }) {
    safeAssign(this, options);

    options.scrollable.onScrolledBottom = () => {
      this.load();
    };
  }

  public load() {
    if(this.loaded) {
      return Promise.resolve();
    }

    if(this.loading) {
      return this.promise;
    }

    this.loading = true;
    this.promise = this.getPromise().then((done) => {
      this.loading = false;
      this.promise = undefined;

      if(done) {
        this.loaded = true;
        this.scrollable.onScrolledBottom = null;
      } else {
        this.scrollable.checkForTriggers();
      }
    }, () => {
      this.promise = undefined;
      this.loading = false;
    });
  }
}
