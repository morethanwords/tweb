/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import cancelSelection from './dom/cancelSelection';

export default class SelectionSaver {
  private input: HTMLElement;
  private range: Range;

  public save(input = document.activeElement as HTMLElement) {
    if(input.isContentEditable || input.tagName === 'INPUT') {
      this.input = input;
    }

    const selection = document.getSelection();
    if(!selection.rangeCount) {
      return;
    }

    this.range = selection.getRangeAt(0);
  }

  public restore(focus?: boolean) {
    if(!this.range) {
      cancelSelection();
      return;
    }

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(this.range);
    focus && this.input?.focus();
  }
}
