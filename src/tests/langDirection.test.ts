import {createRoot, createMemo} from 'solid-js';
import I18n, {isRTLLangCode} from '@lib/langPack';
import Icon from '@components/icon';
import {getIconMirrorClass} from '@/iconsReverse';
import commonStateStorage from '@lib/commonStateStorage';
import rootScope from '@lib/rootScope';
import type {LangPackDifference} from '@layer';

// * a stored pack as the client keeps it: the server's strings, and the English ones it lacks marked local
function storedPack(langCode: string, rtl?: boolean): LangPackDifference {
  return {
    _: 'langPackDifference',
    lang_code: langCode,
    rtl,
    from_version: 0,
    version: 1,
    strings: [
      {_: 'langPackString', key: 'Cancel', value: 'إلغاء'},
      {_: 'langPackString', key: 'OK', value: 'OK.', local: true} as LangPackDifference['strings'][number],
      {_: 'langPackString', key: 'Loading', value: ' (loading)', local: true} as LangPackDifference['strings'][number]
    ]
  };
}

async function applyStoredPack(langCode: string, rtl?: boolean) {
  // * the language change goes to the workers, which a test has none of
  vi.spyOn(rootScope, 'dispatchEvent').mockImplementation(() => {});
  vi.spyOn(commonStateStorage, 'get').mockResolvedValueOnce(storedPack(langCode, rtl) as any);
  await I18n.getCacheLangPackAndApply();
}

describe('language direction', () => {
  const root = document.documentElement;

  afterEach(() => {
    I18n.forceRTL(undefined);
    I18n.applyDirection('en');
  });

  test('right-to-left languages are recognised by their base code', () => {
    for(const code of ['ar', 'fa', 'he', 'ur', 'ckb', 'fa-af', 'ar-raw', 'HE']) {
      expect(isRTLLangCode(code)).toBe(true);
    }

    for(const code of ['en', 'ru', 'pt-br', 'uz', 'farsi', '', undefined]) {
      expect(isRTLLangCode(code)).toBe(false);
    }
  });

  test('applying a language lays the document out in its direction', () => {
    I18n.applyDirection('fa');
    expect(root.dir).toBe('rtl');
    expect(root.lang).toBe('fa');
    expect(root.classList.contains('is-rtl')).toBe(true);
    expect(I18n.getIsRTL()).toBe(true);

    I18n.applyDirection('de');
    expect(root.dir).toBe('ltr');
    expect(root.lang).toBe('de');
    expect(root.classList.contains('is-rtl')).toBe(false);
    expect(I18n.getIsRTL()).toBe(false);
  });

  test('a forced direction holds until it is lifted', () => {
    I18n.applyDirection('en');
    I18n.forceRTL(true);
    expect(root.dir).toBe('rtl');

    I18n.applyDirection('ru');
    expect(root.dir).toBe('rtl');
    expect(root.lang).toBe('ru');

    I18n.forceRTL(false);
    I18n.applyDirection('he');
    expect(root.dir).toBe('ltr');

    I18n.forceRTL(undefined);
    I18n.applyDirection('he');
    expect(root.dir).toBe('rtl');
  });

  test('what reads the direction reactively follows a switch on the fly', () => {
    createRoot((dispose) => {
      const direction = createMemo(() => I18n.isRTL() ? 'rtl' : 'ltr');
      expect(direction()).toBe('ltr');
      I18n.applyDirection('ar');
      expect(direction()).toBe('rtl');
      dispose();
    });
  });

  test('a pack goes by the server\'s word on its language, by its code where there is none', async() => {
    // * a custom pack of a right-to-left language under a code of its own
    await applyStoredPack('persian-beta', true);
    expect(root.dir).toBe('rtl');
    expect(I18n.getIsRTL()).toBe(true);

    await applyStoredPack('ar', false);
    expect(root.dir).toBe('ltr');

    // * stored before the server's word was kept
    await applyStoredPack('fa');
    expect(root.dir).toBe('rtl');

    // * a forced direction lifted goes back to the language's own
    await applyStoredPack('persian-beta', true);
    I18n.forceRTL(false);
    expect(root.dir).toBe('ltr');
    I18n.forceRTL(undefined);
    expect(root.dir).toBe('rtl');
  });

  test('English standing in for a string a right-to-left pack lacks reads left to right', async() => {
    const isolateOf = (element: HTMLElement) => element.querySelector<HTMLElement>(':scope > span[dir="ltr"]');

    await applyStoredPack('ar');
    const untranslated = I18n.i18n('OK');
    const translated = I18n.i18n('Cancel');
    const joined = I18n.i18n('Loading');
    document.body.append(untranslated, translated, joined);

    expect(isolateOf(untranslated).textContent).toBe('OK.');
    expect(untranslated.hasAttribute('dir')).toBe(false);
    expect(isolateOf(translated)).toBeNull();
    // * the space that joins it to what comes before stays out of the isolate, on that side
    expect(joined.firstChild.textContent).toBe(' ');
    expect(isolateOf(joined).textContent).toBe('(loading)');
    expect(joined.textContent).toBe(' (loading)');

    // * an element handed in keeps the direction of its line, its text isolated inside it
    const own = document.createElement('div');
    I18n._i18n(own, 'OK');
    expect(own.hasAttribute('dir')).toBe(false);
    expect(isolateOf(own).textContent).toBe('OK.');

    // * the same English in a left-to-right language is its own text: nothing to set apart
    await applyStoredPack('de');
    expect(isolateOf(untranslated)).toBeNull();
    expect(untranslated.textContent).toBe('OK.');

    untranslated.remove();
    translated.remove();
    joined.remove();
  });

  test('icons that point along the line carry the class that mirrors them', () => {
    expect(getIconMirrorClass('arrow_next')).toBe('icon-mirror');
    expect(getIconMirrorClass('arrow_prev')).toBe('icon-mirror');
    expect(getIconMirrorClass('check')).toBeUndefined();

    // * decided by the stylesheet, not when the icon is made: the same in either direction
    I18n.applyDirection('ar');
    expect(Icon('send2').classList.contains('icon-mirror')).toBe(true);
    I18n.applyDirection('en');
    expect(Icon('send2').classList.contains('icon-mirror')).toBe(true);
    expect(Icon('check').classList.contains('icon-mirror')).toBe(false);
  });
});
