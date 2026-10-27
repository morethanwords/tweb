import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('@components/inputField', () => ({default: class {}}));
vi.mock('@components/ripple', () => ({default: vi.fn()}));

import lang from '@/lang';
import Modes from '@config/modes';
import I18n from '@lib/langPack';
import '@/tests/helpers/a11yLayer';
import {PasswordInputHelpers} from '@components/passwordInputField';

I18n.strings.set('AccDescr.ShowPassword', {_: 'langPackString', key: 'AccDescr.ShowPassword', value: lang['AccDescr.ShowPassword']});

afterEach(() => {
  Modes.a11y = true;
  document.body.replaceChildren();
});

describe('password visibility toggle', () => {
  const mount = () => {
    const container = document.createElement('div');
    const wrapper = document.createElement('div');
    const input = document.createElement('input');
    wrapper.append(input);
    container.append(wrapper);
    document.body.append(container);
    return new PasswordInputHelpers(container, input);
  };

  it('is a named native button the keyboard reaches', () => {
    const {toggleVisible} = mount();

    expect(toggleVisible.tagName).toBe('BUTTON');
    expect(toggleVisible.getAttribute('type')).toBe('button');
    expect(toggleVisible.getAttribute('aria-label')).toBe('Show password');
    expect(toggleVisible.getAttribute('aria-pressed')).toBe('false');
    expect(toggleVisible.tabIndex).toBe(0);
  });

  it('reports the pressed state when activated', () => {
    const helpers = mount();

    helpers.toggleVisible.click();
    expect(helpers.input.type).toBe('text');
    expect(helpers.toggleVisible.getAttribute('aria-pressed')).toBe('true');

    helpers.toggleVisible.click();
    expect(helpers.input.type).toBe('password');
    expect(helpers.toggleVisible.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps its name and role but adds no tab stop without the layer', () => {
    Modes.a11y = false;
    const {toggleVisible} = mount();

    expect(toggleVisible.tagName).not.toBe('BUTTON');
    expect(toggleVisible.getAttribute('role')).toBe('button');
    expect(toggleVisible.getAttribute('aria-label')).toBe('Show password');
    expect(toggleVisible.hasAttribute('tabindex')).toBe(false);
  });
});
