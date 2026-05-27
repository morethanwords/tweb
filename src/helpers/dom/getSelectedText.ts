export default function getSelectedText(): string {
  if(window.getSelection) {
    return window.getSelection().toString();
    // @ts-ignore
  } else if(document.selection) {
    // @ts-ignore
    return document.selection.createRange().text;
  }

  return '';
}
