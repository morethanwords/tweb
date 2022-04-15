/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { toastNew } from "../../components/toast";
import { copyTextToClipboard } from "../clipboard";
import cancelEvent from "./cancelEvent";
import { attachClickEvent } from "./clickEvent";

export default function anchorCopy(options: Partial<{
  // href: string,
  mePath: string
}> = {}) {
  const anchor = document.createElement('a');
  anchor.classList.add('anchor-copy');

  if(options.mePath) {
    const href = 'https://t.me/' + options.mePath;
    anchor.href = anchor.innerText = href;
  }

  attachClickEvent(anchor, (e) => {
    cancelEvent(e);
    copyTextToClipboard(anchor.href);
    toastNew({langPackKey: 'LinkCopied'});
  });

  return anchor;
}
