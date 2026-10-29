/*
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import type {TransportType} from '@lib/mtproto/dcConfigurator';

/*
 * The flags Settings → Experimental keeps on for this site, beside the ones a URL carries (`?debug=1`): every
 * tab of the origin starts with them. Raw localStorage on purpose - Modes is made of them while the modules are
 * still being evaluated, long before the app's own storage exists. A worker has no localStorage: its page hands
 * them over in the worker's URL (makeWorkerURL), the way it hands over its own URL's flags.
 */

const KEPT_FLAGS_KEY = 'experimental_flags';

export const KEPT_FLAGS = [
  'debug',
  'logs',
  'a11y',
  'rtl',
  'noSharedWorker',
  'noServiceWorker',
  'noWorker',
  'noOffscreenCanvas',
  'noObjectUrlRevoke',
  'noPfs',
  'http',
  'noMultipleTransports',
  'forceHideNonContactLinks'
] as const;

export type KeptFlag = typeof KEPT_FLAGS[number];

// * switched while the app runs, and read by the page alone: kept out of the workers' URLs, kept or from the page's
// * own, where switching one would start a second SharedWorker for the same accounts
const PAGE_ONLY_FLAGS: ReadonlySet<string> = new Set(['rtl', 'memoryWatch']);

export function isPageOnlyFlag(flag: string) {
  return PAGE_ONLY_FLAGS.has(flag);
}

// * 'logs' a worker does read (its log buffer), so a page's own ?logs=1 goes on to it and it collects from its start,
// * on a worker of its own, as before; kept for the site, it is not handed over: every tab of the site keeps the same
// * and tells its workers itself (setLogBufferEnabled), which one tab's own URL flag could not
const isWorkerFlag = (flag: KeptFlag) => flag !== 'logs' && !isPageOnlyFlag(flag);

export function getKeptFlags(): Set<KeptFlag> {
  try {
    const flags = JSON.parse(localStorage.getItem(KEPT_FLAGS_KEY));
    if(Array.isArray(flags)) {
      return new Set(KEPT_FLAGS.filter((flag) => flags.includes(flag)));
    }
  } catch(err) {}

  return new Set();
}

export function setKeptFlags(flags: ReadonlySet<KeptFlag>) {
  const list = KEPT_FLAGS.filter((flag) => flags.has(flag));
  try {
    if(list.length) localStorage.setItem(KEPT_FLAGS_KEY, JSON.stringify(list));
    else localStorage.removeItem(KEPT_FLAGS_KEY);
  } catch(err) {}
}

export function setKeptFlag(flag: KeptFlag, on: boolean) {
  const flags = getKeptFlags();
  if(on) flags.add(flag);
  else flags.delete(flag);
  setKeptFlags(flags);
}

// * what this page started with: Modes is made of it, and the workers it starts get the same - a change made later
// * applies from the next start
export const LOADED_KEPT_FLAGS: ReadonlySet<KeptFlag> = getKeptFlags();

export function getLoadedWorkerFlags(): KeptFlag[] {
  return [...LOADED_KEPT_FLAGS].filter(isWorkerFlag);
}

export function isFlagInURL(flag: string) {
  return location.search.indexOf(flag + '=1') > 0;
}

// * this page's URL without those of the flags it has, or nothing when it has none: a flag switched off leaves the URL
// * too, or the next start turns it on again
export function getURLWithoutFlags(flags: Iterable<string>) {
  let url: URL;
  for(const flag of flags) {
    if(!isFlagInURL(flag)) continue;
    url ??= new URL(location.href);
    url.searchParams.delete(flag);
  }

  return url;
}

// * on by the URL (?name=1), or kept on for the whole site - what Modes says of it
export function isFlagOn(flag: KeptFlag) {
  return isFlagInURL(flag) || LOADED_KEPT_FLAGS.has(flag);
}

const Modes = {
  // * or a preview whose account lives on the test DCs (VITE_TEST_DC, from its seed - see
  // * vite.preview.config.ts), so that no link to it needs ?test=1 to work. The URL alone: the test
  // * servers have storage of their own, so the switch is the tab's, never the whole site's
  test: isFlagInURL('test') || !!import.meta.env.VITE_TEST_DC,
  debug: isFlagOn('debug'),
  // * the log ring buffers without the rest of debug mode (see lib/debug/logsBuffer)
  logs: isFlagOn('logs'),
  // Preview-only QA override: exercise the non-contact link gate even when
  // the server does not expose report_spam / block_contact for the peer.
  forceHideNonContactLinks: !!import.meta.env.VITE_PREVIEW &&
    isFlagOn('forceHideNonContactLinks'),
  http: false,
  ssl: true, // location.search.indexOf('ssl=1') > 0 || location.protocol === 'https:' && location.search.indexOf('ssl=0') === -1,
  asServiceWorker: !!import.meta.env.VITE_MTPROTO_SW,
  transport: 'websocket' as TransportType,
  noSharedWorker: isFlagOn('noSharedWorker'),
  noServiceWorker: isFlagOn('noServiceWorker'),
  noOffscreenCanvas: isFlagOn('noOffscreenCanvas'),
  // Kill switch for the SHARED object-URL lifecycle: with it on, worker-minted
  // blob URLs are never evicted from the caches, never revoked, and pins are
  // not reported — the old leak-forever behaviour for shared media.
  // Tab-local one-off URLs (ObjectURLScope: editor previews, upload previews,
  // decoded voice) are NOT covered: disposing those is self-contained and was
  // a plain leak fix, so it stays active even here. Neither are the handful of
  // pre-existing raw URL.revokeObjectURL call sites (recording, rtmp, download).
  // * OFF everywhere by default — the lifecycle is live in production too.
  // * ?noObjectUrlRevoke=1 forces it on to fall back to the old behaviour
  //   (it reaches the worker too — makeWorkerURL forwards query params).
  noObjectUrlRevoke: isFlagOn('noObjectUrlRevoke'),
  // Run MTProto + crypto entirely in the main thread (debug only). Loops the
  // worker entries back through a MessageChannel in the same realm so
  // breakpoints / call stacks span the whole pipeline. Multi-tab features
  // (SharedWorker dedup, auto-lock cross-tab) silently degrade.
  // Triggers: ?noWorker=1 in the URL, or VITE_NO_WORKER injected at build time
  // by `bash scripts/start-preview.sh --no-worker`.
  noWorker: isFlagOn('noWorker') || !!import.meta.env.VITE_NO_WORKER,
  multipleTransports: !!(import.meta.env.VITE_MTPROTO_AUTO && import.meta.env.VITE_MTPROTO_HAS_HTTP && import.meta.env.VITE_MTPROTO_HAS_WS) && !isFlagOn('noMultipleTransports'),
  // Perfect Forward Secrecy: every networker talks over a temporary auth key
  // bound to the stored permanent one (auth.bindTempAuthKey), replaced once it
  // expires or the server forgets it. On by default; ?noPfs=1 turns it off (the
  // worker sees it too — makeWorkerURL forwards query params).
  pfs: !isFlagOn('noPfs'),
  // The keyboard and screen-reader layer: focus traps, roving tab stops, focus
  // rings, key routing, inert off-screen columns, pinch zoom. Off by default
  // until it settles; ?a11y=1 turns it on. ARIA names and roles stay either way,
  // since nobody without assistive technology can tell they are there.
  a11y: isFlagOn('a11y'),
  // Lays the app out right to left in whatever language is loaded, to check a layout in RTL
  // without switching to Arabic, Persian or Hebrew; the real switch follows the language.
  rtl: isFlagOn('rtl'),
  // Keeps a memory history of this tab (lib/debug/memoryWatch) for as long as the URL carries it -
  // a developer's own long-lived tab, never anyone else's.
  memoryWatch: isFlagInURL('memoryWatch')
};

if(import.meta.env.VITE_MTPROTO_HAS_HTTP) {
  const httpOnly = Modes.http = isFlagOn('http');
  if(httpOnly) {
    Modes.multipleTransports = false;
  }
}

// * start with HTTP first
if(Modes.multipleTransports) {
  Modes.http = true;
}

if(Modes.http) {
  Modes.transport = 'https';
}

export default Modes;
