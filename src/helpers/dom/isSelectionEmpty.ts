export default function isSelectionEmpty(selection = window.getSelection()) {
  if(!selection?.rangeCount) {
    return true;
  }

  const selectionRange = selection.getRangeAt(0);
  if(selectionRange.collapsed || !selectionRange.START_TO_END) {
    return true;
  }

  return false;
}
