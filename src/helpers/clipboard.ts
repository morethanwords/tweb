/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// https://stackoverflow.com/a/30810322
function fallbackCopyTextToClipboard(text: string, html?: string) {
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
    const selection = window.getSelection();
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
    window.getSelection().removeAllRanges();
  } catch(err) {
    console.error('unable to copy', err);
  }

  document.body.removeChild(textArea);
}

export async function copyTextToClipboard(text: string, html?: string) {
  if(!navigator.clipboard) {
    fallbackCopyTextToClipboard(text);
    return;
  }

  try {
    if(!html) {
      await navigator.clipboard.writeText(text);
      return;
    }

    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([text], {type: 'text/plain'}),
        'text/html': new Blob([html], {type: 'text/html'})
      })
    ]);
  } catch(err) {
    console.error('clipboard error', err);
    fallbackCopyTextToClipboard(text, html);
  }
}
