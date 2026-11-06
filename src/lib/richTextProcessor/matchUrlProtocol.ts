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

// reads the protocol off the TEXT, the way the url parser does before it validates anything else:
// tabs and newlines are dropped wherever they sit and leading C0/space is skipped, so `java\nscript:`
// and ` javascript:` are the same protocol to a browser and have to be the same one here
const STRIPPED_REG_EXP = /[\t\n\r]/g;
const PROTOCOL_REG_EXP = /^[\x00-\x20]*([a-z][a-z\d+\-.]*):/i;
function matchUrlProtocolText(text: string) {
  const match = text?.replace(STRIPPED_REG_EXP, '').match(PROTOCOL_REG_EXP);
  return match && match[1].toLowerCase() + ':';
}

// a url with no protocol of its own is meant as an ordinary https one, and a `javascript:` payload
// must never survive as a navigable url — both end up as https here.
// a url that spells any other protocol is handed back untouched even when the parser rejects it
// (`https://t.me:99999/x`, a port out of range): prefixing that one builds `https://https://…`,
// which is neither the link that was written nor a link at all
export function normalizeUrlProtocol(url: string) {
  const protocol = matchUrlProtocolText(url);
  return protocol && !SKIP_PROTOCOLS.has(protocol) ? url : 'https://' + url;
}

/** Whether a URL is a web page's: http or https — not a script, data, or another app's scheme. */
export function isWebPageUrl(url: URL) {
  return url.protocol === 'https:' || url.protocol === 'http:';
}
