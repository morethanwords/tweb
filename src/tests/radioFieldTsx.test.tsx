import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('@components/radioField', () => ({
  default: class RadioField {
    public input = document.createElement('input');
    public container = document.createElement('span');
    public main = document.createElement('div');
    private _locked = false;

    constructor(options: {value?: string} = {}) {
      this.input.type = 'radio';
      this.input.value = options.value || '';
      this.main.classList.add('radio-field-main');
      this.container.classList.add('radio-field');
      this.container.append(this.input, this.main);
    }

    public get checked() {
      return this.input.checked;
    }

    public get locked() {
      return this._locked;
    }

    public set locked(value: boolean) {
      this._locked = value;
      this.container.classList.toggle('locked', value);
    }

    public setValueSilently(value: boolean) {
      this.input.checked = value;
    }
  }
}));

vi.mock('@components/rowTsx', () => {
  const Row = (props: {children: any}) => <div class="row">{props.children}</div>;
  Row.RadioField = (props: {children: any}) => props.children;
  Row.Title = (props: {children: any}) => <div class="row-title">{props.children}</div>;
  Row.Subtitle = (props: {children: any}) => <div class="row-subtitle">{props.children}</div>;
  return {default: Row};
});

import RadioFieldTsx from '@components/radioFieldTsx';
import RadioFormTsx from '@components/radioFormTsx';
import Row from '@components/rowTsx';

describe('RadioFieldTsx', () => {
  let dispose: () => void;

  afterEach(() => {
    dispose?.();
    document.body.replaceChildren();
  });

  it('keeps the imperative radio field in sync with Solid state', () => {
    const [checked, setChecked] = createSignal(false);
    const onChange = vi.fn();

    dispose = render(() => (
      <Row>
        <Row.RadioField>
          <RadioFieldTsx
            checked={checked()}
            name="test"
            value="option"
            onChange={onChange}
          />
        </Row.RadioField>
      </Row>
    ), document.body);

    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.checked).toBe(false);
    expect(document.querySelector('.radio-field-main')?.textContent).toBe('');

    setChecked(true);
    expect(input.checked).toBe(true);

    input.checked = false;
    input.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith(false, expect.any(Event));
  });

  it('removes the change listener on cleanup', () => {
    const onChange = vi.fn();

    dispose = render(() => (
      <Row>
        <Row.RadioField>
          <RadioFieldTsx name="test" onChange={onChange} />
        </Row.RadioField>
      </Row>
    ), document.body);

    const input = document.querySelector('input') as HTMLInputElement;
    dispose();
    dispose = undefined;
    input.dispatchEvent(new Event('change'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the lock state in sync', () => {
    const [locked, setLocked] = createSignal(false);

    dispose = render(() => (
      <Row>
        <Row.RadioField>
          <RadioFieldTsx locked={locked()} name="test" />
        </Row.RadioField>
      </Row>
    ), document.body);

    const field = document.querySelector('.radio-field') as HTMLElement;
    expect(field.classList.contains('locked')).toBe(false);

    setLocked(true);
    expect(field.classList.contains('locked')).toBe(true);
  });

  it('keeps the control accessible without owning a caption', () => {
    const [ariaLabel, setAriaLabel] = createSignal('Correct answer');

    dispose = render(() => (
      <Row>
        <Row.RadioField>
          <RadioFieldTsx
            ariaLabel={ariaLabel()}
            name="test"
            value="option"
          />
        </Row.RadioField>
        <Row.Title>Option</Row.Title>
      </Row>
    ), document.body);

    const field = document.querySelector('.radio-field') as HTMLElement;
    const input = document.querySelector('input') as HTMLInputElement;
    expect(field.textContent).not.toContain('Option');
    expect(document.querySelector('.row-title')?.textContent).toBe('Option');
    expect(input.getAttribute('aria-label')).toBe('Correct answer');

    setAriaLabel(undefined);
    expect(input.hasAttribute('aria-label')).toBe(false);
  });

  it('renders declarative rows and reports the selected value', () => {
    const onChange = vi.fn();

    dispose = render(() => (
      <RadioFormTsx
        values={[
          {checked: true, text: 'First', value: 'first'},
          {subtitle: 'Details', text: 'Second', value: 'second'}
        ]}
        onChange={onChange}
      />
    ), document.body);

    const inputs = [...document.querySelectorAll('input')] as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    expect(inputs[0].checked).toBe(true);
    expect(document.querySelector('.row-title')?.textContent).toBe('First');
    expect(document.querySelector('.row-subtitle')?.textContent).toBe('Details');

    inputs[1].checked = true;
    inputs[1].dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith('second', expect.any(Event));
  });

  it('updates the selected value without replacing rows', () => {
    const [selected, setSelected] = createSignal<'first' | 'second'>('first');
    const values = [
      {text: 'First', value: 'first' as const},
      {text: 'Second', value: 'second' as const}
    ];

    dispose = render(() => (
      <RadioFormTsx
        selected={selected()}
        values={values}
        onChange={() => {}}
      />
    ), document.body);

    const rows = [...document.querySelectorAll('.row')];
    const inputs = [...document.querySelectorAll('input')] as HTMLInputElement[];
    expect(inputs.map((input) => input.checked)).toEqual([true, false]);

    setSelected('second');

    expect([...document.querySelectorAll('.row')]).toEqual(rows);
    expect(inputs.map((input) => input.checked)).toEqual([false, true]);
  });
});
