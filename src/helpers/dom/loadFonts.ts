/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

let promise: Promise<any>;
export default function loadFonts(): Promise<void> {
  if(promise) return promise;
  // @ts-ignore
  return promise = 'fonts' in document ? Promise.all(['400 1rem Roboto', '500 1rem Roboto', '500 1rem tgico'].map(font => document.fonts.load(font))) : Promise.resolve();
}
