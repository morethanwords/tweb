/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function isSelectionEmpty(selection = window.getSelection()) {
  if(!selection || !selection.rangeCount) {
    return true;
  }

  const selectionRange = selection.getRangeAt(0);
  if(!selectionRange.toString() || !selectionRange.START_TO_END) {
    return true;
  }

  return false;
}
