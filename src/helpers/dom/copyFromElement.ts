/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import SelectionSaver from "../selectionSaver";
import selectElementContents from "./selectElementContents";

export default function copyFromElement(element: HTMLElement) {
  const saver = new SelectionSaver();
  saver.save();
  selectElementContents(element);
  document.execCommand('copy');
  saver.restore();
}
