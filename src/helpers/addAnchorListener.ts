import wrapUrl from '@lib/richTextProcessor/wrapUrl';
import matchTelegramUrlHost from '@lib/richTextProcessor/matchTelegramUrlHost';
import cancelEvent from '@helpers/dom/cancelEvent';
import parseUriParams from '@helpers/string/parseUriParams';

// * https://core.telegram.org/api/links

type InternalLinkAnchorType =
  | 'showMaskedAlert'
  | 'execBotCommand'
  | 'searchByHashtag'
  | 'addstickers'
  | 'im'
  | 'resolve'
  | 'privatepost'
  | 'voicechat'
  | 'call'
  | 'joinchat'
  | 'join'
  | 'invoice'
  | 'addemoji'
  | 'setMediaTimestamp'
  | 'addlist'
  | 'boost'
  | 'premium_offer'
  | 'giftcode'
  | 'm'
  | 'message'
  | 'stars_topup'
  | 'share'
  | 'msg_url'
  | 'nft'
  | 'iv'
  | 'new'
  | 'settings'
  | 'contacts'
  | 'chats'
  | 'addstyle'
;

export const UNSAFE_ANCHOR_LINK_TYPES: Set<InternalLinkAnchorType> = new Set([
  'showMaskedAlert',
  'execBotCommand'
]);

export default function addAnchorListener<
  Params extends {
    pathnameParams?: any,
    uriParams?: any
  }
>(options: {
  name: InternalLinkAnchorType,
  protocol?: 'tg',
  callback: (params: Params & {element?: HTMLAnchorElement, masked?: boolean, event?: Event}) => any,
  noPathnameParams?: boolean,
  noUriParams?: boolean,
  noCancelEvent?: boolean
}) {
  (window as any)[(options.protocol ? options.protocol + '_' : '') + options.name] = (element?: HTMLAnchorElement, e?: Event) => {
    !options.noCancelEvent && cancelEvent(null);

    let href = element.href;
    if(!href) {
      return;
    }

    let pathnameParams: any[];
    let uriParams: any;

    const u = new URL(href);
    const match = matchTelegramUrlHost(u);
    if(match?.prefix) {
      u.pathname = match.prefix + (u.pathname === '/' ? '' : u.pathname);
      href = u.toString();
    }

    if(!options.noPathnameParams) pathnameParams = new URL(href).pathname.split('/').slice(1);
    if(!options.noUriParams) uriParams = parseUriParams(href);

    const masked = element.href !== wrapUrl(element.textContent).url && element.getAttribute('safe') === null;
    const result = options.callback({
      ...{pathnameParams, uriParams} as Params,
      element,
      masked,
      event: e || window.event
    });

    if(!e?.isTrusted) {
      return result;
    }
  };
}

const MIDDLE_BUTTON = 1;

/** The handler's name, spelled by either carrier: an inline `onclick`, or a web-page box's dataset. */
function getAnchorCallbackName(anchor: HTMLAnchorElement) {
  const fromDataset = anchor.dataset.callback;
  if(fromDataset) {
    return fromDataset;
  }

  const onclick = anchor.getAttribute('onclick'); // `showMaskedAlert(this)`
  const index = onclick ? onclick.indexOf('(') : -1;
  return index > 0 ? onclick.slice(0, index) : undefined;
}

/**
 * A masked link asks before it opens, and that question hangs off the anchor's `onclick` — which
 * the browser fires for the primary button alone. A middle click went around it and opened the
 * real host in a new tab, i.e. exactly the navigation the alert is there to hold back, so it is
 * answered with the same alert. The remaining ways past it (the native context menu, dragging
 * the link out) belong to the browser and cannot be taken back from it.
 */
function onMaskedAnchorAuxClick(e: MouseEvent) {
  if(e.button !== MIDDLE_BUTTON || e.defaultPrevented) {
    return false;
  }

  // the innermost anchor, not the innermost MASKED one: a plain link nested in a masked web-page
  // box carries its own destination, and the box's alert would name a url nobody clicked
  const anchor = (e.target as Element)?.closest?.('a');
  if(!anchor?.href || getAnchorCallbackName(anchor) !== 'showMaskedAlert') {
    return false;
  }

  const showMaskedAlert = (window as any).showMaskedAlert;
  if(!showMaskedAlert) {
    return false;
  }

  cancelEvent(e);
  showMaskedAlert(anchor, e);
  return true;
}

let listeningForMaskedAnchorAuxClicks = false;
export function listenForMaskedAnchorAuxClicks() {
  if(listeningForMaskedAnchorAuxClicks) {
    return;
  }

  listeningForMaskedAnchorAuxClicks = true;
  // bubble phase on purpose: a capture-phase guard closer to the content (hidden links inside
  // bubbles, the read-only preview chat) gets to swallow the click before this one sees it
  document.addEventListener('auxclick', onMaskedAnchorAuxClick);
}
