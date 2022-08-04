/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {i18n, LangPackKey} from '../lib/langPack';

export default function formatBytes(bytes: number, decimals = 2) {
  if(bytes === 0) return i18n('FileSize.B', [0]);

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes: LangPackKey[] = ['FileSize.B', 'FileSize.KB', 'FileSize.MB', 'FileSize.GB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return i18n(sizes[i], [parseFloat((bytes / Math.pow(k, i)).toFixed(dm))]);
}
