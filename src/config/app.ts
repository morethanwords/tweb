/*
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import type {TrueDcId} from '@types';
import langPackLocalVersion from '@/langPackLocalVersion';

export const MAIN_DOMAINS = import.meta.env.VITE_ALLOWED_HOSTS ?
  import.meta.env.VITE_ALLOWED_HOSTS.split(',').map((d) => d.replace(/^https?:\/\//, '').replace(/\/$/, '').trim()) :
  ['web.telegram.org', 'webk.telegram.org'];
export const DEFAULT_BACKGROUND_SLUG = 'pattern';

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
  baseDcId: (import.meta.env.VITE_BASE_DC_ID ? parseInt(import.meta.env.VITE_BASE_DC_ID, 10) : 2) as TrueDcId,
  isMainDomain: MAIN_DOMAINS.includes(location.hostname),
  suffix: 'K',
  threads,
  lottieWorkers: threads,
  cryptoWorkers: threads,
  interclientBroadcastChannel: 'tgweb'
};

export default App;
