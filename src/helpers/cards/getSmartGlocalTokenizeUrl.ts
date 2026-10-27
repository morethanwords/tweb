const PATH = '/cds/v1/tokenize/card';

/**
 * Where Smart Glocal turns a card into a token. The payment form may name its own endpoint, which is
 * taken only when it is exactly that endpoint on a Smart Glocal host: the card number and the code go
 * there. Anything else falls back to Smart Glocal's own one, its playground for a test invoice.
 */
export default function getSmartGlocalTokenizeUrl(tokenizeUrl: unknown, isTest?: boolean) {
  let url: URL;
  try {
    url = new URL(tokenizeUrl as string);
  } catch(err) {}

  if(
    url &&
    url.href === tokenizeUrl &&
    url.protocol === 'https:' &&
    url.hostname.endsWith('.smart-glocal.com') &&
    !url.port && !url.username && !url.password &&
    url.pathname === PATH && !url.search && !url.hash
  ) {
    return url.href;
  }

  return `https://${isTest ? 'tgb-playground' : 'tgb'}.smart-glocal.com${PATH}`;
}
