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
