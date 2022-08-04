/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function createDownloadAnchor(url: string, fileName: string, onRemove?: () => void) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.target = '_blank';

  a.style.position = 'absolute';
  a.style.top = '1px';
  a.style.left = '1px';

  document.body.append(a);

  try {
    const clickEvent = document.createEvent('MouseEvents');
    clickEvent.initMouseEvent('click', true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
    a.dispatchEvent(clickEvent);
  } catch(e) {
    console.error('Download click error', e);
    try {
      a.click();
    } catch(e) {
      window.open(url as string, '_blank');
    }
  }

  setTimeout(() => {
    a.remove();
    onRemove && onRemove();
  }, 100);
}
