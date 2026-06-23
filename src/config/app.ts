/*
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import type {TrueDcId} from '@types';
import langPackLocalVersion from '@/langPackLocalVersion';

export const MAIN_DOMAINS = ['web.telegram.org', 'webk.telegram.org', 'web.andropay.xyz'];
export const DEFAULT_BACKGROUND_SLUG = 'pattern';

// Peers (by peerId) that should never be shown in the dialog lists.
// User peerId === userId, so 777000 is the official "Telegram" service-notifications chat.
export const HIDDEN_DIALOG_PEER_IDS = new Set<PeerId>([777000 as PeerId]);

const threads = Math.min(4, navigator.hardwareConcurrency ?? 4);

const App = {
  id: +import.meta.env.VITE_API_ID,
  hash: import.meta.env.VITE_API_HASH,
  pushServerKey: import.meta.env.VITE_PUSH_SERVER_KEY,
  version: import.meta.env.VITE_VERSION,
  versionFull: import.meta.env.VITE_VERSION_FULL,
  build: +import.meta.env.VITE_BUILD,
  langPackVersion: +import.meta.env.VITE_LANG_PACK_VERSION,
  langPackLocalVersion: langPackLocalVersion,
  langPack: 'webk',
  langPackCode: 'en',
  domains: MAIN_DOMAINS,
  baseDcId: 2 as TrueDcId,
  isMainDomain: MAIN_DOMAINS.includes(location.hostname),
  suffix: 'K',
  threads,
  lottieWorkers: threads,
  cryptoWorkers: threads,
  interclientBroadcastChannel: 'tgweb'
};

if(App.isMainDomain) { // use Webogram credentials then
  App.id = 2496;
  App.hash = '8da85b0d5bfe62527e5b244c209159c3';
  App.pushServerKey = 'BHEbKOXt-GD8MCTTYiAYT3I5R4MB0epIE7Tbbymj1uR0xJRE_7m27eXTVAC_P19TeZnO9413lRz-0oZ87JRPKPM';
}

export default App;
