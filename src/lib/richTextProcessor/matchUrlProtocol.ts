const SKIP_PROTOCOLS: Set<string> = new Set([
  'javascript:'
]);
export default function matchUrlProtocol(text: string) {
  if(!text) {
    return null;
  }

  try {
    const protocol = new URL(text).protocol;
    if(SKIP_PROTOCOLS.has(protocol)) {
      return null;
    }

    return protocol;
  } catch(err) {
    return null;
  }
}

// a url with no protocol of its own is meant as an ordinary https one, and a `javascript:` payload
// must never survive as a navigable url — both end up as https here
export function normalizeUrlProtocol(url: string) {
  return matchUrlProtocol(url) ? url : 'https://' + url;
}
