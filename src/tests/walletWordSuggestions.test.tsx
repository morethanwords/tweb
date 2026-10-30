/*
 * The suggestions under a secret phrase's word field are taken from the keyboard too: Up and Down move along them
 * (the caret keeps Left and Right), and Enter, Space and Tab take the one moved to — the first until then. The field
 * says which one it is to a screen reader. Nothing here talks to a server.
 */

import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('@lib/rootScope', () => ({default: {managers: {}, addEventListener: () => {}, removeEventListener: () => {}}}));
vi.mock('@helpers/dom/shake', () => ({default: () => {}}));

import WalletWordFields from '@components/wallet/screens/wordFields';

const WORDLIST: ReadonlySet<string> = new Set(['abandon', 'ability', 'able', 'about', 'above', 'act', 'action', 'actor', 'zoo']);

let dispose: () => void;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

/** two word fields, the first one focused with `typed` in it */
function mount(typed: string) {
  const container = document.createElement('div');
  document.body.append(container);
  const [words, setWords] = createSignal<string[]>([]);
  dispose = render(() => (
    <WalletWordFields
      numbers={[1, 2]}
      words={words}
      setWord={(index, word) => setWords((list) => Object.assign([...list], {[index]: word}))}
      wordlist={() => WORDLIST}
      onWords={() => {}}
      onSubmit={() => {}}
      canSubmit={() => false}
    />
  ), container);

  const [first, second] = container.querySelectorAll('input');
  first.focus();
  first.value = typed;
  first.dispatchEvent(new Event('input', {bubbles: true}));
  const options = () => [...container.querySelectorAll<HTMLElement>('[role="option"]')];
  return {
    words,
    first,
    second,
    options,
    // * answers whether the key went on as it does (not prevented)
    press: (key: string) => first.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true})),
    picked: () => options().find((option) => option.getAttribute('aria-selected') === 'true')
  };
}

describe('the suggestions under a word field', () => {
  it('take the first with Enter until another one is picked', () => {
    const field = mount('ab');
    expect(field.options().map((option) => option.textContent)).toEqual(['abandon', 'ability', 'able']);
    expect(field.picked().textContent).toBe('abandon');
    expect(field.first.getAttribute('aria-activedescendant')).toBe(field.picked().id);

    field.press('Enter');
    expect(field.words()[0]).toBe('abandon');
    expect(document.activeElement).toBe(field.second);
  });

  it('take the one Down and Up moved to, round the end', () => {
    const field = mount('ab');
    field.press('ArrowDown');
    field.press('ArrowDown');
    expect(field.picked().textContent).toBe('able');
    expect(field.first.getAttribute('aria-activedescendant')).toBe(field.picked().id);

    field.press('ArrowDown');
    expect(field.picked().textContent).toBe('abandon');
    field.press('ArrowUp');
    expect(field.picked().textContent).toBe('able');

    field.press('Tab');
    expect(field.words()[0]).toBe('able');
    expect(document.activeElement).toBe(field.second);
  });

  it('start over at the first when the word typed changes', () => {
    const field = mount('ab');
    field.press('ArrowDown');
    expect(field.picked().textContent).toBe('ability');

    field.first.value = 'abo';
    field.first.dispatchEvent(new Event('input', {bubbles: true}));
    expect(field.options().map((option) => option.textContent)).toEqual(['about', 'above']);
    expect(field.picked().textContent).toBe('about');

    field.press('ArrowDown');
    field.press(' ');
    expect(field.words()[0]).toBe('above');
  });

  it('let Tab go on from a word typed in full that starts other words too', () => {
    const field = mount('act');
    expect(field.options().map((option) => option.textContent)).toEqual(['act', 'action', 'actor']);
    // * Tab moves focus as it does, so in the last field it is not held there
    expect(field.press('Tab')).toBe(true);
    expect(field.words()[0]).toBe('act');
  });
});
