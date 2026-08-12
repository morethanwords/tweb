import {toastNew} from '@components/toast';
import {LangPackKey} from '@lib/langPack';
import {copyTextToClipboard} from '@helpers/clipboard';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';

const shortDomain = import.meta.env.VITE_SHORT_DOMAIN || 't.me';
const T_ME = `https://${shortDomain}/`;
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
