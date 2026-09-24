import {describe, expect, test} from 'vitest';
import {createMemo, createRoot} from 'solid-js';
import Section, {appendSectionContent} from '@components/section';
import {unwrapSolidElement} from '@helpers/solid/wrapSolidComponent';

/*
 * `<Section/>` is a component, and a component's result is not always the node
 * it renders. The dev server wraps every component in a memo for hot reload
 * (`vite-plugin-solid` turns solid-refresh on only for `command === 'serve'`),
 * so the same expression is a function there and an element in a production
 * build. Imperative code that keeps the value and reaches into it — the chat
 * folder editor builds three sections this way — has to resolve it first.
 *
 * Vitest does not apply that transform, so these tests stand the memo up by
 * hand: that is the shape the dev server produces, and the shape that used to
 * take the folder editor down with `section.querySelector is not a function`.
 */
describe('a section handed to imperative code', () => {
  test('appends its content element and returns it', () => {
    const section = (<Section name={'InviteLinks'} noDelimiter />) as HTMLElement;
    const content = appendSectionContent(section);

    expect(content.classList.contains('sidebar-left-section-content')).toBe(true);
    expect(content.parentElement).toBe(section.querySelector('.sidebar-left-section'));
  });

  test('says what is wrong when it is handed the component result instead of the node', () => {
    createRoot((dispose) => {
      const asDevServerWrapsIt = createMemo(() => (<Section name={'InviteLinks'} noDelimiter />));

      expect(() => appendSectionContent(asDevServerWrapsIt as any))
      .toThrow(/expected the section element, got function/);
      expect(() => appendSectionContent(asDevServerWrapsIt as any))
      .toThrow(/unwrapSolidElement/);

      dispose();
    });
  });

  test('unwrapping that same value gives back the node imperative code needs', () => {
    createRoot((dispose) => {
      const asDevServerWrapsIt = createMemo(() => (<Section name={'InviteLinks'} noDelimiter />));
      const section = unwrapSolidElement(asDevServerWrapsIt as any) as HTMLElement;

      expect(typeof section.querySelector).toBe('function');
      expect(appendSectionContent(section).parentElement)
      .toBe(section.querySelector('.sidebar-left-section'));

      dispose();
    });
  });

  test('says what is wrong when the section renders no content at all', () => {
    const section = (<Section noContent />) as HTMLElement;

    expect(() => appendSectionContent(section)).toThrow(/no content element/);
  });
});
