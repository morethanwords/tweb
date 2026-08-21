/**
 * The audio row's classes are its contract with the rest of the app: styles key off them, and so do
 * `bubbles` (temp→real swap), `selection` (checkbox placement), `findMediaTargets` (playlist order)
 * and the global `messages_media_read` sweep. The row is a Solid component now, so Solid owns
 * `class` on that node — which is exactly where earlier attempts lost `audio` off the music variant,
 * and where a joined class string would silently drop the `audio-48 search-super-item` a playlist
 * row picks up after it is built.
 *
 * So this pins both halves: that every class is declared on Row's `classList`, and that a reactive
 * `classList` really does leave foreign classes alone. The second half goes through `RippleElement`,
 * which is the element Row renders and the one that decides how classes reach the DOM.
 */

import {vi} from 'vitest';
import {render} from 'solid-js/web';
import {createStore} from 'solid-js/store';
import RippleElement from '@components/rippleElement';

vi.mock('@environment/touchSupport', () => ({default: false}));

const SOURCE_PATH = 'src/components/audio.tsx';

/** Every class the row puts on its own root — see `AudioRowState` in audio.tsx. */
const ROOT_CLASSES = [
  'audio',
  'audio-details',
  'is-voice',
  'is-out',
  'can-transcribe',
  'is-unread',
  'is-outgoing',
  'audio-with-thumb',
  'corner-download',
  'downloading',
  'audio-show-progress'
];

describe('audio row classes', () => {
  let source: string;

  beforeAll(async() => {
    const {readFile} = await import('fs/promises');
    source = await readFile(SOURCE_PATH, 'utf-8');
  });

  test('every root class is declared on Row, not added imperatively', () => {
    const classList = source.match(/classList=\{\{([\s\S]*?)\}\}/)?.[1];
    expect(classList).toBeDefined();

    for(const className of ROOT_CLASSES) {
      expect(classList).toContain(`'${className}'`);
    }

    // `el` is the row root. A `classList.add` there would be undone by the next reactive update.
    expect(source).not.toContain('el.classList.add');
    expect(source).not.toContain('el.classList.remove');
  });

  test('the row is built with the shared Row component, and is no longer a custom element', () => {
    expect(source).toContain(`from '@components/rowTsx'`);
    expect(source).toContain('<Row');
    expect(source).not.toContain('customElements.define');
    expect(source).not.toContain('adoptRow');
  });

  test('markup is declarative — no innerHTML on the row', () => {
    expect(source).not.toContain('el.innerHTML');
    expect(source).not.toContain('el.insertAdjacentHTML');
  });

  test('a reactive classList toggles state classes and keeps foreign ones', () => {
    const [state, setState] = createStore({downloading: false});

    const container = document.createElement('div');
    const dispose = render(() => (
      <RippleElement
        component="div"
        noRipple
        classList={{
          'row': true,
          'audio': true,
          'audio-details': true,
          'downloading': state.downloading
        }}
      />
    ), container);

    const row = container.querySelector('.audio') as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.classList.contains('audio-details')).toBe(true);
    expect(row.classList.contains('downloading')).toBe(false);

    // what the playlist and shared media do once the row is handed back to them
    row.classList.add('audio-48', 'search-super-item');

    setState('downloading', true);
    expect(row.classList.contains('downloading')).toBe(true);
    expect(row.classList.contains('audio')).toBe(true);
    expect(row.classList.contains('audio-48')).toBe(true);
    expect(row.classList.contains('search-super-item')).toBe(true);

    setState('downloading', false);
    expect(row.classList.contains('downloading')).toBe(false);
    expect(row.classList.contains('audio-48')).toBe(true);

    dispose();
  });
});
