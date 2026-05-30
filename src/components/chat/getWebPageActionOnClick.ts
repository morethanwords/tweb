import {WebPage} from '@layer';
import {UNSAFE_ANCHOR_LINK_TYPES} from '@helpers/addAnchorListener';
import wrapUrl from '@lib/richTextProcessor/wrapUrl';

/**
 * Reproduces the click behaviour the bubble web-page renderer attaches to a
 * preview box (see `bubbles.ts` → `messageMediaWebPage`): derive the internal
 * link handler from the page URL via `wrapUrl`, then on click dispatch it
 * through `window[onclick](anchor, e)` — exactly what the bubble does after
 * storing the handler name in `box.dataset.callback`.
 *
 * Factored out so other surfaces (e.g. the pinned-message bar's "Join" button)
 * can offer the same action without re-deriving the dispatch. The anchor the
 * handler needs (it only reads `.href`) is synthesised here, so the caller's
 * element can stay a plain button and never navigates on its own.
 *
 * `allowedTypes` restricts which web-page `type`s are actionable — pass
 * `['telegram_call']` so only call previews produce a handler and every other
 * preview type is ignored.
 *
 * Returns the click handler, or `undefined` when the page isn't an allowed
 * type / has no registered internal handler.
 */
export default function getWebPageActionOnClick(
  webPage: WebPage,
  allowedTypes: WebPage.webPage['type'][]
): ((e: Event) => void) | undefined {
  if(webPage._ !== 'webPage' || !allowedTypes.includes(webPage.type)) {
    return;
  }

  const wrapped = wrapUrl(webPage.url);
  const onclick = wrapped.onclick;
  // `wrapUrl` already nulls `onclick` when the matching `window[onclick]`
  // handler isn't registered; the UNSAFE check mirrors the renderer's
  // `hasSafeUrl` gate so masked-alert types never reach here.
  if(!onclick || UNSAFE_ANCHOR_LINK_TYPES.has(onclick)) {
    return;
  }

  return (e) => {
    // The internal-link handlers (`window.call`, …) only read `.href` off the
    // passed element — mirror the renderer's safe box with a detached <a>
    // carrying the wrapped URL and `safe="1"`. Detached, so it never navigates;
    // the handler cancels the event and routes the slug into `joinConference`.
    const anchor = document.createElement('a');
    anchor.href = wrapped.url;
    anchor.setAttribute('safe', '1');
    (window as any)[onclick](anchor, e);
  };
}
