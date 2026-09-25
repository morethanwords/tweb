export const LINK_PROTOCOLS = new Set([
  'ftp:',
  'http:',
  'https:',
  'mailto:',
  'tel:',
  'tg:',
  'tonsite:'
]);

/**
 * Whether an href that already exists in a document may stay a link — as
 * opposed to `normalizeLinkUrl`, which turns what a person typed into a URL.
 *
 * A relative href names no protocol and so cannot name a dangerous one; an
 * absolute one has to be on the list. Whitespace and control characters are
 * stripped first, because `java&Tab;script:` and `\u0001javascript:` are still
 * script URLs to the navigator while looking scheme-less to a naive match.
 */
export function isAllowedLinkHref(href: unknown) {
  if(typeof(href) !== 'string') return false;

  const scheme = href.replace(/[\u0000-\u0020\s]/g, '').match(/^([a-z][a-z\d+.-]*):/i);
  return !scheme || LINK_PROTOCOLS.has(`${scheme[1].toLowerCase()}:`);
}

export default function normalizeLinkUrl(value: string) {
  const raw = value.trim();
  if(!raw || /\s/.test(raw)) return;
  if(raw[0] === '#') return /^#[^#]+$/.test(raw) ? raw : undefined;

  const hasProtocol = /^[a-z][a-z\d+.-]*:/i.test(raw);
  const normalized = hasProtocol ? raw : `https://${raw}`;
  try {
    const url = new URL(normalized);
    if(!LINK_PROTOCOLS.has(url.protocol)) return;
    if(
      (
        url.protocol === 'ftp:' ||
        url.protocol === 'http:' ||
        url.protocol === 'https:' ||
        url.protocol === 'tonsite:'
      ) &&
      !url.hostname
    ) {
      return;
    }
    if(
      (url.protocol === 'mailto:' || url.protocol === 'tel:' || url.protocol === 'tg:') &&
      !raw.slice(url.protocol.length).trim()
    ) return;
    return normalized;
  } catch{
    return;
  }
}
