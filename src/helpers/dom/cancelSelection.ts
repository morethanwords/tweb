import {getAppWindow} from '@helpers/appWindow';

export default function cancelSelection() {
  const win = getAppWindow();
  if(win.getSelection) {
    if(win.getSelection().empty) {  // Chrome
      win.getSelection().empty();
    } else if(win.getSelection().removeAllRanges) {  // Firefox
      win.getSelection().removeAllRanges();
    }
    // @ts-ignore
  } else if(document.selection) {  // IE?
    // @ts-ignore
    document.selection.empty();
  }
}
