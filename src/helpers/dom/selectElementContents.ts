// https://stackoverflow.com/a/6150060
export default function selectElementContents(el: HTMLElement) {
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  const sel = el.ownerDocument.defaultView.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
