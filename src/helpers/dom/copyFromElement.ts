/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {copyTextToClipboard} from '@helpers/clipboard';
// import SelectionSaver from "@helpers/selectionSaver";
// import selectElementContents from "@helpers/dom/selectElementContents";

export default function copyFromElement(element: HTMLElement) {
  copyTextToClipboard(element.textContent);
  // const saver = new SelectionSaver();
  // saver.save();
  // selectElementContents(element);
  // document.execCommand('copy');
  // saver.restore();
}
