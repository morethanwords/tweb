import Modes from '@config/modes';
import {getAppWindow} from '@helpers/appWindow';
import {FOCUS_TRAP_ATTACHED_ATTRIBUTE} from '@helpers/dom/focusTrap';
import isLastInputPointer from '@helpers/dom/inputModality';

export type CopyToClipboardOptions = {
  /** Re-throw the underlying error instead of swallowing it (e.g. so a caller can show a toast) */
  rethrow?: boolean;
};

type ClipboardItemData = ConstructorParameters<typeof ClipboardItem>[0];

function getClipboardContext(appWindow = getAppWindow()) {
  const ClipboardItemConstructor = (appWindow as any).ClipboardItem as typeof ClipboardItem;
  const clipboard = appWindow.navigator.clipboard;

  return {ClipboardItemConstructor, clipboard};
}

export function canWriteClipboardItem(mimeType: string, appWindow = getAppWindow()) {
  const {ClipboardItemConstructor, clipboard} = getClipboardContext(appWindow);
  return !!(
    ClipboardItemConstructor &&
    clipboard?.write &&
    (!ClipboardItemConstructor.supports || ClipboardItemConstructor.supports(mimeType))
  );
}

export function writeClipboardItem(data: ClipboardItemData, appWindow = getAppWindow()) {
  const {ClipboardItemConstructor, clipboard} = getClipboardContext(appWindow);
  if(!ClipboardItemConstructor || !clipboard?.write) {
    throw new Error('Clipboard item writing is not supported');
  }

  return clipboard.write([new ClipboardItemConstructor(data)]);
}

// https://stackoverflow.com/a/30810322
function fallbackCopyTextToClipboard(
  text: string,
  html?: string,
  options?: CopyToClipboardOptions,
  appWindow = getAppWindow()
) {
  const {document} = appWindow;
  const textArea = document.createElement('textarea');
  textArea.value = text;
  // an open dialog's focus trap would take the focus back, and its selection with it
  textArea.setAttribute(FOCUS_TRAP_ATTACHED_ATTRIBUTE, '');
  // the HTML goes to the clipboard as it is and is never parsed here: rendered in the app's document,
  // the handlers of whatever text went into it would run in the app's origin
  if(html) {
    textArea.addEventListener('copy', (e) => {
      if(!e.clipboardData) {
        return;
      }

      e.clipboardData.setData('text/plain', text);
      e.clipboardData.setData('text/html', html);
      e.preventDefault();
    });
  }

  // Avoid scrolling to bottom
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.position = 'fixed';

  // with the keyboard layer, the focus the copy borrows goes back where it was (a dialog's Copy)
  const focused = Modes.a11y ? document.activeElement as HTMLElement : undefined;
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    document.execCommand('copy');
    appWindow.getSelection().removeAllRanges();
  } catch(err) {
    console.error('unable to copy', err);
    if(options?.rethrow) {
      throw err;
    }
  } finally {
    document.body.removeChild(textArea);
    if(focused?.isConnected && (!document.activeElement || document.activeElement === document.body)) {
      focused.focus({preventScroll: true, ...(isLastInputPointer() && {focusVisible: false})});
    }
  }
}

export async function copyTextToClipboard(text: string, html?: string, options?: CopyToClipboardOptions) {
  const appWindow = getAppWindow();
  const BlobConstructor = (appWindow as any).Blob as typeof Blob;
  if(!appWindow.navigator.clipboard) {
    fallbackCopyTextToClipboard(text, undefined, options, appWindow);
    return;
  }

  try {
    if(!html) {
      await appWindow.navigator.clipboard.writeText(text);
      return;
    }

    await writeClipboardItem({
      'text/plain': new BlobConstructor([text], {type: 'text/plain'}),
      'text/html': new BlobConstructor([html], {type: 'text/html'})
    }, appWindow);
  } catch(err) {
    console.error('clipboard error', err);
    // The fallback will rethrow if it also fails and the caller opted in
    fallbackCopyTextToClipboard(text, html, options, appWindow);
  }
}

/**
 * Copies a text that is still to come (one the worker answers with). Safari writes only within the click that asks
 * for it, and an answer from the worker comes after it, so the write starts at once with the text promised; where a
 * ClipboardItem cannot be written, or its write is refused, the text is written once it comes
 * (`copyTextToClipboard`, down to `execCommand`). Rejects when it is not copied.
 */
export function copyPendingTextToClipboard(text: Promise<string>) {
  const appWindow = getAppWindow();
  const copyOnceCome = () => text.then((text) => copyTextToClipboard(text, undefined, {rethrow: true}));
  if(!canWriteClipboardItem('text/plain', appWindow)) {
    return copyOnceCome();
  }

  const BlobConstructor = (appWindow as any).Blob as typeof Blob;
  let written: Promise<void>;
  try {
    written = writeClipboardItem({
      'text/plain': text.then((text) => new BlobConstructor([text], {type: 'text/plain'}))
    }, appWindow);
  } catch(err) {
    written = Promise.reject(err);
  }

  return written.catch((err) => {
    console.error('clipboard error', err);
    return copyOnceCome();
  });
}
