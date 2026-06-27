import {getAppWindow} from '@helpers/appWindow';

export default function getSelectedText(): string {
  if(getAppWindow().getSelection) {
    return getAppWindow().getSelection().toString();
    // @ts-ignore
  } else if(document.selection) {
    // @ts-ignore
    return document.selection.createRange().text;
  }

  return '';
}
