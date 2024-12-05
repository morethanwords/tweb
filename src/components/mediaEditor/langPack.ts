// As the new strings we're not available for the contest, we're injecting at runtime

import lang from '../../lang';
import I18n from '../../lib/langPack';

const startIdx = Object.entries(lang).findIndex(([key]) => key.startsWith('MediaEditor'))
const mediaEditorLang = Object.fromEntries(Object.entries(lang).slice(startIdx, Infinity));

let injected = false;

export function injectMediaEditorLangPack() {
  if(injected) return;
  Object.entries(mediaEditorLang).forEach(([key, value]) => {
    I18n.strings.set(key as keyof typeof lang, {
      _: 'langPackString',
      key,
      value: value as string
    });
  });
  injected = true;
}
