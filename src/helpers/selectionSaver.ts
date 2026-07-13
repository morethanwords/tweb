import cancelSelection from '@helpers/dom/cancelSelection';
import {getAppWindow} from '@helpers/appWindow';

export default class SelectionSaver {
  private input: HTMLElement;
  private range: Range;

  public save(input = getAppWindow().document.activeElement as HTMLElement) {
    if(input.isContentEditable || input.tagName === 'INPUT') {
      this.input = input;
    }

    const selection = getAppWindow().getSelection();
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

    const selection = getAppWindow().getSelection();
    selection.removeAllRanges();
    selection.addRange(this.range);
    focus && this.input?.focus();
  }
}
