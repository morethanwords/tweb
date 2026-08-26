import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';

vi.mock('@lib/apiManagerProxy', () => ({default: {getState: vi.fn()}}));
vi.mock('@lib/rootScope', () => ({
  default: {managers: {appStateManager: {setByKey: vi.fn()}}}
}));
vi.mock('@components/icon', () => ({
  default: () => document.createElement('span')
}));
vi.mock('@components/ripple', () => ({
  default: () => ({dispose: vi.fn(), element: document.createElement('div')})
}));
vi.mock('@helpers/dom/createContextMenu', () => ({
  default: () => ({open: vi.fn()})
}));

import RadioFieldTsx from '@components/radioFieldTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import Row from '@components/rowTsx';

describe('Row.RadioField interaction', () => {
  let dispose: VoidFunction;

  afterEach(() => {
    dispose?.();
    document.body.replaceChildren();
  });

  it('selects a radio when its row title is clicked', () => {
    const onClick = vi.fn();
    const onChange = vi.fn();

    dispose = render(() => (
      <Row noRipple clickable={onClick}>
        <Row.RadioField>
          <RadioFieldTsx
            checked={false}
            name="privacy"
            value="contacts"
            onChange={onChange}
          />
        </Row.RadioField>
        <Row.Title>My Contacts</Row.Title>
      </Row>
    ), document.body);

    const row = document.querySelector('.row') as HTMLLabelElement;
    const radioField = document.querySelector('.radio-field');
    const input = document.querySelector('input') as HTMLInputElement;
    const title = document.querySelector('.row-title') as HTMLElement;

    expect(row.tagName).toBe('LABEL');
    expect(radioField.tagName).toBe('SPAN');
    expect(row.querySelector('label')).toBeNull();
    expect(row.htmlFor).toBe('');
    expect(input.id).toBe('');
    expect(input.labels).toHaveLength(1);
    expect(input.labels.item(0)).toBe(row);
    expect(row.control).toBe(input);
    expect(input.checked).toBe(false);

    title.click();

    expect(input.checked).toBe(true);
    expect(onClick).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(true, expect.any(Event));
  });

  it('preserves native cancellation for a locked row', () => {
    const onClick = vi.fn((event: MouseEvent) => event.preventDefault());
    const onChange = vi.fn();

    dispose = render(() => (
      <Row noRipple clickable={onClick}>
        <Row.RadioField>
          <RadioFieldTsx
            checked={false}
            name="privacy"
            value="contacts"
            onChange={onChange}
          />
        </Row.RadioField>
        <Row.Title>My Contacts</Row.Title>
      </Row>
    ), document.body);

    const input = document.querySelector('input') as HTMLInputElement;
    const title = document.querySelector('.row-title') as HTMLElement;

    title.click();

    expect(input.checked).toBe(false);
    expect(onClick).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uses one semantic label and invokes a checkbox row handler once', () => {
    const onClick = vi.fn();
    const onChange = vi.fn();

    dispose = render(() => (
      <Row noRipple clickable={onClick}>
        <Row.CheckboxFieldToggle>
          <CheckboxFieldTsx checked={false} toggle onChange={onChange} />
        </Row.CheckboxFieldToggle>
        <Row.Title>Enabled</Row.Title>
      </Row>
    ), document.body);

    const row = document.querySelector('.row') as HTMLLabelElement;
    const field = document.querySelector('.checkbox-field');
    const input = document.querySelector('input') as HTMLInputElement;
    const title = document.querySelector('.row-title') as HTMLElement;

    expect(row.tagName).toBe('LABEL');
    expect(field.tagName).toBe('SPAN');
    expect(row.querySelector('label')).toBeNull();
    expect(row.control).toBe(input);

    title.click();

    expect(input.checked).toBe(true);
    expect(onClick).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('only removes classes that Row added to an external element', () => {
    const external = document.createElement('div');
    external.classList.add('row-right');

    dispose = render(() => (
      <Row noRipple>
        <Row.Title>External content</Row.Title>
        <Row.RightContent element={external} class="temporary-row-class" />
      </Row>
    ), document.body);

    expect(external.classList.contains('row-right')).toBe(true);
    expect(external.classList.contains('temporary-row-class')).toBe(true);

    dispose();
    dispose = undefined;

    expect(external.classList.contains('row-right')).toBe(true);
    expect(external.classList.contains('temporary-row-class')).toBe(false);
  });

  it('mounts empty row parts for explicit refs without sentinel content', () => {
    let title: HTMLDivElement;
    let subtitle: HTMLDivElement;

    dispose = render(() => (
      <Row noRipple>
        <Row.Title ref={(element) => title = element} />
        <Row.Subtitle ref={(element) => subtitle = element} />
      </Row>
    ), document.body);

    expect(title).toBe(document.querySelector('.row-title'));
    expect(subtitle).toBe(document.querySelector('.row-subtitle'));
    expect(title.textContent).toBe('');
    expect(subtitle.textContent).toBe('');
    expect(document.body.textContent).not.toContain('true');
  });
});
