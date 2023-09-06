/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {FontFamilyName} from '../../config/font';
import noop from '../noop';
import pause from '../schedulers/pause';
import {TGICO_CLASS} from '../tgico';

const texts = ['b', 'б'];
type FontType = 'text' | 'icons' | 'monospace';

const cache: {
  [key: string]: {
    [text: string]: Promise<any>
  }
} = {};

const fonts: {[type in FontType]: string} = {
  text: FontFamilyName,
  icons: TGICO_CLASS,
  monospace: 'Roboto Mono'
};

export default function loadFonts(types: {[type in FontType]?: string[] | 'all'} = {
  text: texts,
  icons: undefined,
  monospace: texts
}): Promise<any> {
  if(!('fonts' in document)) {
    return Promise.resolve();
  }

  const promises: Promise<any>[] = [];
  for(const type in types) {
    let _texts = types[type as FontType];
    if(_texts === 'all') {
      _texts = texts;
    }

    const font = fonts[type as FontType];
    const weights = type === 'icons' ? [500] : [400, 500];
    for(const weight of weights) {
      const _promises = (_texts || [undefined]).map((text) => {
        const key = [weight, '1rem', font].join(' ');
        const promise = (cache[key] ??= {})[text || ''] ??= document.fonts.load(key, text);
        return promise;
      });
      promises.push(..._promises);
    }
  }

  return Promise.race([
    Promise.all(promises).catch(noop),
    pause(1000)
  ]);
}
