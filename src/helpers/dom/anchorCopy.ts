import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {copyTmeLink, copyUsername, T_ME} from '@helpers/copyContact';

export default function anchorCopy(options: Partial<{
  // href: string,
  mePath: string,
  username: string,
  /** Takes over the click; `copy` is what it would have done. */
  onClick: (copy: () => void) => void
}> = {}) {
  const anchor = document.createElement('a');
  anchor.classList.add('anchor-copy');

  let copy: () => void;
  if(options.mePath) {
    anchor.href = anchor.innerText = T_ME + options.mePath;
    copy = () => copyTmeLink(options.mePath);
  }

  if(options.username) {
    anchor.href = T_ME + options.username;
    anchor.innerText = '@' + options.username;
    copy = () => copyUsername(options.username);
  }

  attachClickEvent(anchor, (e) => {
    cancelEvent(e);
    if(options.onClick) options.onClick(copy);
    else copy();
  });

  return anchor;
}
