import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const checkboxState = vi.hoisted(() => ({
  input: undefined as HTMLInputElement,
  options: undefined as {checked?: boolean, stateKey?: string}
}));

vi.mock('@components/checkboxField', () => ({
  default: class CheckboxField {
    public input = document.createElement('input');
    public label = document.createElement('label');

    constructor(options: {checked?: boolean, stateKey?: string} = {}) {
      checkboxState.input = this.input;
      checkboxState.options = options;
      this.input.type = 'checkbox';
      this.input.checked = !!options.checked;
      this.label.append(this.input);
    }

    public setValueSilently(checked: boolean) {
      this.input.checked = checked;
    }

    public setToggleLockIcon() {}

    public toggleDisability(disabled: boolean) {
      this.input.disabled = disabled;
    }
  }
}));

import CheckboxFieldTsx from '@components/checkboxFieldTsx';

describe('CheckboxFieldTsx', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    checkboxState.input = undefined;
    checkboxState.options = undefined;
  });

  it('updates its signal without requiring an onChange callback', () => {
    const [checked, setChecked] = createSignal(false);
    const container = document.createElement('div');
    const dispose = render(() => (
      <CheckboxFieldTsx signal={[checked, setChecked]} />
    ), container);

    checkboxState.input.checked = true;
    expect(() => checkboxState.input.dispatchEvent(new Event('change'))).not.toThrow();
    expect(checked()).toBe(true);

    dispose();
  });

  it('leaves checked undefined so CheckboxField can load a persisted stateKey', () => {
    const container = document.createElement('div');
    const dispose = render(() => (
      <CheckboxFieldTsx stateKey="settings.stickers.loop" toggle />
    ), container);

    expect(checkboxState.options).toMatchObject({stateKey: 'settings.stickers.loop'});
    expect(checkboxState.options).not.toHaveProperty('checked');

    dispose();
  });

  it('still forwards an explicitly controlled false value', () => {
    const container = document.createElement('div');
    const dispose = render(() => (
      <CheckboxFieldTsx checked={false} />
    ), container);

    expect(checkboxState.options).toHaveProperty('checked', false);

    dispose();
  });

  it('keeps the native input disability in sync', () => {
    const [disabled, setDisabled] = createSignal(true);
    const container = document.createElement('div');
    const dispose = render(() => (
      <CheckboxFieldTsx disabled={disabled()} />
    ), container);

    expect(checkboxState.input.disabled).toBe(true);

    setDisabled(false);
    expect(checkboxState.input.disabled).toBe(false);

    dispose();
  });
});
