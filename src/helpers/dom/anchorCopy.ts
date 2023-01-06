/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {toastNew} from '../../components/toast';
import {LangPackKey} from '../../lib/langPack';
import {copyTextToClipboard} from '../clipboard';
import cancelEvent from './cancelEvent';
import {attachClickEvent} from './clickEvent';

const T_ME = 'https://t.me/';
export default function anchorCopy(options: Partial<{
  // href: string,
  mePath: string,
  username: string
}> = {}) {
  const anchor = document.createElement('a');
  anchor.classList.add('anchor-copy');

  let copyWhat: string, copyText: LangPackKey = 'LinkCopied';
  if(options.mePath) {
    const href = T_ME + options.mePath;
    copyWhat = anchor.href = anchor.innerText = href;
  }

  if(options.username) {
    const href = T_ME + options.username;
    anchor.href = href;
    copyWhat = anchor.innerText = '@' + options.username;
    copyText = 'UsernameCopied';
  }

  attachClickEvent(anchor, (e) => {
    cancelEvent(e);
    copyTextToClipboard(copyWhat ?? anchor.href);
    toastNew({langPackKey: copyText});
  });

  return anchor;
}
