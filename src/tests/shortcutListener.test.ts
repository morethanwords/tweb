import {addShortcutListener} from '@helpers/shortcutListener';

const env = vi.hoisted(() => ({isApple: false}));
vi.mock('@environment/userAgent', async(importOriginal) => {
  const actual = await importOriginal<typeof import('@environment/userAgent')>();
  return {...actual, get IS_APPLE() {
    return env.isApple;
  }};
});

// * what the browser reports for one key press: `key` is the character the layout types, `code` the key's place
type Press = {
  key: string,
  code: string,
  ctrlKey?: boolean,
  altKey?: boolean,
  metaKey?: boolean,
  shiftKey?: boolean,
  modifierAltGraph?: boolean
};

function press(combos: string[], init: Press) {
  const fired: string[] = [];
  const remove = addShortcutListener(combos, (combo) => fired.push(combo));
  const event = new KeyboardEvent('keydown', {...init, bubbles: true, cancelable: true});
  document.dispatchEvent(event);
  remove();
  return {fired, prevented: event.defaultPrevented};
}

const SEARCH = ['ctrl+f', 'alt+f', 'meta+f'];

describe('shortcut listener', () => {
  afterEach(() => {
    env.isApple = false;
  });

  test('a Latin layout matches by the letter it types', () => {
    expect(press(SEARCH, {key: 'f', code: 'KeyF', ctrlKey: true})).toEqual({fired: ['ctrl+f'], prevented: true});
    // * Dvorak: F sits where QWERTY has Y, and the F place types U
    expect(press(SEARCH, {key: 'f', code: 'KeyY', ctrlKey: true}).fired).toEqual(['ctrl+f']);
    expect(press(SEARCH, {key: 'u', code: 'KeyF', ctrlKey: true})).toEqual({fired: [], prevented: false});
  });

  test('a non-Latin layout matches by the key\'s place', () => {
    // * the F key on Russian (also with Shift), Greek, Hebrew, Arabic and Korean layouts
    for(const key of ['а', 'А', 'φ', 'כ', 'ب', 'ㄹ']) {
      expect(press(SEARCH, {key, code: 'KeyF', ctrlKey: true}), key).toEqual({fired: ['ctrl+f'], prevented: true});
    }

    // * Alt types nothing on Windows and Linux
    expect(press(SEARCH, {key: 'а', code: 'KeyF', altKey: true}).fired).toEqual(['alt+f']);

    env.isApple = true;
    expect(press(SEARCH, {key: 'а', code: 'KeyF', metaKey: true}).fired).toEqual(['meta+f']);
  });

  test('a non-Latin letter typed with AltGr or Option is text, not a shortcut', () => {
    // * AltGr is reported as Ctrl+Alt on Windows
    expect(press(SEARCH, {key: 'ѓ', code: 'KeyF', ctrlKey: true, altKey: true, modifierAltGraph: true}))
    .toEqual({fired: [], prevented: false});
    expect(press(SEARCH, {key: 'ѓ', code: 'KeyF', modifierAltGraph: true})).toEqual({fired: [], prevented: false});

    // * a Mac layout whose Option+F types a Cyrillic letter (SuperCyrillic)
    env.isApple = true;
    expect(press(SEARCH, {key: 'ѓ', code: 'KeyF', altKey: true})).toEqual({fired: [], prevented: false});
  });

  test('a non-Latin letter on another key does not match', () => {
    expect(press(SEARCH, {key: 'в', code: 'KeyD', ctrlKey: true})).toEqual({fired: [], prevented: false});
  });

  test('a symbol typed on the key does not match', () => {
    // * Hungarian AltGr (Ctrl+Alt on Windows) + F types '['; macOS Option+F types 'ƒ'
    expect(press(SEARCH, {key: '[', code: 'KeyF', ctrlKey: true, altKey: true})).toEqual({fired: [], prevented: false});
    expect(press(SEARCH, {key: 'ƒ', code: 'KeyF', altKey: true})).toEqual({fired: [], prevented: false});
  });

  test('without the modifier nothing matches', () => {
    expect(press(SEARCH, {key: 'а', code: 'KeyF'})).toEqual({fired: [], prevented: false});
  });
});
