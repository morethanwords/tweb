/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// https://stackoverflow.com/a/30810322
function fallbackCopyTextToClipboard(text: string) {
  var textArea = document.createElement('textarea');
  textArea.value = text;

  // Avoid scrolling to bottom
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.position = 'fixed';

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    document.execCommand('copy');
    // const successful = document.execCommand('copy');
    // const msg = successful ? 'successful' : 'unsuccessful';
    // console.log('Fallback: Copying text command was ' + msg);
  } catch(err) {
    // console.error('Fallback: Oops, unable to copy', err);
  }

  document.body.removeChild(textArea);
}

export function copyTextToClipboard(text: string) {
  if(!navigator.clipboard) {
    fallbackCopyTextToClipboard(text);
    return;
  }

  navigator.clipboard.writeText(text).catch((err) => {
    console.error('clipboard error', err);
    fallbackCopyTextToClipboard(text);
  });
}
