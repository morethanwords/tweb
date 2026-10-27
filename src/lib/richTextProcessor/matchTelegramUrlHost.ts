import {T_ME_PREFIXES} from '@appManagers/constants';

const TELEGRAM_LINK_HOSTS = ['t.me', 'telegram.me'];
export const TELESCOPE_LINK_HOST = 'telesco.pe';

/**
 * Tells whether a url sits on one of `hosts` (or a subdomain of one).
 *
 * Every host decision has to go through the PARSED url: a check on the raw text would also trust
 * `t.me.evil.com` (nothing ends the host), `t.me@evil.com` (the host is a login there) and a
 * `telesco.pe/…` buried in some other host's path. Userinfo is refused outright rather than
 * ignored — a url that hides a login has nothing to gain from an internal handler.
 *
 * Returns the matched host plus the labels in front of it (`durov.t.me` → `durov`), or undefined
 * when the url is on some other host.
 */
export function matchUrlHost(url: URL, hosts: string[]) {
  if(!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return;
  }

  const hostname = url.hostname.toLowerCase();
  // the host itself before a parent listed ahead of it: with `telegram.org` and
  // `translations.telegram.org` both in, the latter is that host, not a subdomain of the former
  const host = hosts.find((host) => hostname === host) ??
    hosts.find((host) => hostname.endsWith('.' + host));
  if(!host) {
    return;
  }

  return {host, subdomain: hostname === host ? '' : hostname.slice(0, -host.length - 1)};
}

/**
 * Tells a Telegram link host from any other one.
 *
 * The RETURNED OBJECT is the verdict — `prefix` is not. It carries the username the host itself
 * spells (`durov.t.me` → `durov`) and stays undefined on a plain `t.me/durov`, so a caller that
 * tests `match?.prefix` instead of `match` treats every non-subdomain link as external.
 */
export default function matchTelegramUrlHost(url: URL): {prefix?: string} | undefined {
  const match = matchUrlHost(url, TELEGRAM_LINK_HOSTS);
  if(!match) {
    return;
  }

  // `web.t.me`, `k.t.me` … name a client, not a user
  const prefixLabels = match.subdomain ? match.subdomain.split('.') : [];
  while(prefixLabels.length && T_ME_PREFIXES.has(prefixLabels[prefixLabels.length - 1])) {
    prefixLabels.pop();
  }

  const prefix = prefixLabels.join('.');
  return {prefix: prefix || undefined};
}
