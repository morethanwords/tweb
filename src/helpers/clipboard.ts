import {getAppWindow} from '@helpers/appWindow';

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
  const textArea = document.createElement(html ? 'div' : 'textarea');
  if(html) {
    textArea.tabIndex = 0;
    textArea.contentEditable = 'true';
    textArea.innerHTML = html;
  } else {
    (textArea as HTMLTextAreaElement).value = text;
  }

  // Avoid scrolling to bottom
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.position = 'fixed';

  document.body.appendChild(textArea);
  textArea.focus();
  if(html) {
    const selection = appWindow.getSelection();
    selection.removeAllRanges();
    const range = document.createRange();
    range.setStartBefore(textArea.firstChild);
    range.setEndAfter(textArea.lastChild);
    selection.addRange(range);
  } else {
    (textArea as HTMLTextAreaElement).select();
  }

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
