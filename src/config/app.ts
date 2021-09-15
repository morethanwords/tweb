/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import type { DcId } from "../types";

export const MAIN_DOMAIN = 'web.telegram.org';

const App = {
  id: 1025907,
  hash: '452b0359b988148995f22ff0f4229750',
  version: '0.8.4',
  langPackVersion: '0.3.3',
  langPack: 'macos',
  langPackCode: 'en',
  domains: [MAIN_DOMAIN] as string[],
  baseDcId: 2 as DcId,
  isMainDomain: location.hostname === MAIN_DOMAIN,
  suffix: 'K'
};

if(App.isMainDomain) { // use Webogram credentials then
  App.id = 2496;
  App.hash = '8da85b0d5bfe62527e5b244c209159c3';
}

export default App;
