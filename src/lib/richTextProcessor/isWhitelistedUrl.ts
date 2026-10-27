import {untrack} from 'solid-js';
import {appState} from '@stores/appState';
import {matchUrlHost} from '@lib/richTextProcessor/matchTelegramUrlHost';

/**
 * Tells whether `url` sits on one of `domains`, a host list the server sends in the app config.
 * The host has to be listed itself — the server names every one it means, so a subdomain of a
 * listed host is not covered.
 */
export default function isWhitelistedUrl(url: string, domains: string[]) {
  if(!domains?.length) {
    return false;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch(err) {
    return false;
  }

  return matchUrlHost(parsedUrl, domains)?.subdomain === '';
}

/**
 * Tells whether a link that hides its address under other text may open without asking: the
 * server vouches for its host in the app config's `whitelisted_domains`.
 */
export function isMaskedUrlTrusted(url: string) {
  // read while rendering, often inside a component: a later app config must not re-render it
  return untrack(() => isWhitelistedUrl(url, appState.appConfig?.whitelisted_domains));
}
