import setBlankToAnchor from '@lib/richTextProcessor/setBlankToAnchor';
import isSuspiciousUrl from '@helpers/string/isSuspiciousUrl';
import {normalizeUrlProtocol} from '@lib/richTextProcessor/matchUrlProtocol';

export default function safeWindowOpen(url: string) {
  // most callers hand over a url straight off the wire (a web app event, a keyboard button, a
  // gift's listing url) without running it through `wrapUrl` first, so it gets the same protocol
  // filter here — a `javascript:` payload must not run on this origin
  url = normalizeUrlProtocol(url);

  // every external url opened without an anchor of its own passes through here — inline keyboard
  // buttons, story links, web app events — so a lookalike host is caught in one place. the alert
  // is reached through the global the anchor listeners register, keeping this leaf helper free of
  // the popup's imports; before the app registers it there is nothing to confirm with
  const showMaskedAlert = (window as any).showMaskedAlert;
  if(showMaskedAlert && isSuspiciousUrl(url)) {
    const anchor = setBlankToAnchor(document.createElement('a'));
    anchor.href = url; // the alert prints `anchor.href`, i.e. the punycode form of the host
    showMaskedAlert(anchor);
    return;
  }

  window.open(url, '_blank', 'noreferrer');
}
