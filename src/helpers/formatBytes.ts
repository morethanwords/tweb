/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {i18n, LangPackKey} from '../lib/langPack';

export default function formatBytes(bytes: number, decimals: number | 'auto' = 'auto') {
  if(bytes === 0) return i18n('FileSize.B', [0]);

  const strictDecimals = decimals === 'auto';

  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const _decimals = decimals === 'auto' ? Math.max(0, i - 1) : decimals;

  const dm = Math.max(0, _decimals);
  const sizes: LangPackKey[] = ['FileSize.B', 'FileSize.KB', 'FileSize.MB', 'FileSize.GB'];

  const fixed = (bytes / Math.pow(k, i)).toFixed(dm);
  return i18n(sizes[i], [strictDecimals ? fixed : parseFloat(fixed)]);
}
