import {afterEach, describe, expect, test, vi} from 'vitest';
import {render} from 'solid-js/web';
import {getIconContent} from '@components/icon';
import {RADIO_FIELD_RIGHT_CLASS} from '@components/rowFieldClasses';
import Row from '@components/rowTsx';

vi.mock('@components/rippleElement', () => ({
  default: (props: any) => (
    <div classList={props.classList}>
      {props.children}
    </div>
  )
}));

vi.mock('@helpers/dom/createContextMenu', () => ({
  default: () => ({open: () => {}})
}));

let dispose: () => void;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

describe('Row.Icon', () => {
  test('renders a registered icon inside a separate gradient container', () => {
    const mount = document.createElement('div');
    document.body.append(mount);

    dispose = render(() => (
      <Row>
        <Row.Icon icon="data_filled" />
        <Row.Title>Data</Row.Title>
      </Row>
    ), mount);

    const container = mount.querySelector('.row-icon');
    const icon = container.firstElementChild;

    expect(container.classList.contains('row-icon-colored')).toBe(true);
    expect(container.classList.contains('tgico')).toBe(false);
    expect(container.getAttribute('style')).toContain('linear-gradient');
    expect(icon.classList.contains('row-icon-icon')).toBe(true);
    expect(icon.classList.contains('tgico')).toBe(true);
  });

  test('uses a deterministic fallback background when no color is supplied', () => {
    const mount = document.createElement('div');
    document.body.append(mount);

    dispose = render(() => (
      <Row>
        <Row.Icon icon="data" />
        <Row.Title>Data</Row.Title>
      </Row>
    ), mount);

    const container = mount.querySelector('.row-icon');

    expect(container.classList.contains('row-icon-colored')).toBe(true);
    expect(container.getAttribute('style')).toContain('linear-gradient');
    expect(container.firstElementChild.classList.contains('tgico')).toBe(true);
    expect(container.firstElementChild.textContent).toBe(getIconContent('data'));
  });
});

describe('Row.RadioField', () => {
  test('mounts a right-aligned radio inside titleRight', () => {
    const mount = document.createElement('div');
    document.body.append(mount);

    dispose = render(() => (
      <Row>
        <Row.Title>Choice</Row.Title>
        <Row.Subtitle>Description</Row.Subtitle>
        <Row.RadioField>
          <label class={RADIO_FIELD_RIGHT_CLASS} data-radio="right">
            <span class="radio-field-main" />
          </label>
        </Row.RadioField>
      </Row>
    ), mount);

    const row = mount.querySelector('.row');
    const radio = mount.querySelector('[data-radio="right"]');
    const titleRight = mount.querySelector('.row-title-right');

    expect(radio.parentElement).toBe(titleRight);
    expect(radio.parentElement).not.toBe(row);
    expect(row.classList.contains('row-with-padding')).toBe(false);
    expect(row.querySelector('.row-right')).toBe(null);
  });

  test('keeps explicit titleRight content beside a right-aligned radio', () => {
    const mount = document.createElement('div');
    document.body.append(mount);

    dispose = render(() => (
      <Row>
        <Row.Title titleRight={<span data-title-right>Details</span>}>Choice</Row.Title>
        <Row.RadioField>
          <label class={RADIO_FIELD_RIGHT_CLASS} data-radio="right">
            <span class="radio-field-main" />
          </label>
        </Row.RadioField>
      </Row>
    ), mount);

    const titleRight = mount.querySelector('.row-title-right');
    const radio = mount.querySelector('[data-radio="right"]');

    expect(titleRight.querySelector('[data-title-right]')).not.toBe(null);
    expect(radio.parentElement).toBe(titleRight);
    expect(titleRight.classList.contains('row-title-right-with-control')).toBe(true);
  });

  test('keeps the title wrapper in the title grid slot when Row.RightContent is present', () => {
    const mount = document.createElement('div');
    document.body.append(mount);

    dispose = render(() => (
      <Row>
        <Row.Title titleRight={<span data-grid-title-right>Details</span>}>Choice</Row.Title>
        <Row.Subtitle>Description</Row.Subtitle>
        <Row.RadioField>
          <label class={RADIO_FIELD_RIGHT_CLASS} data-radio="right">
            <span class="radio-field-main" />
          </label>
        </Row.RadioField>
        <Row.RightContent data-row-action>Action</Row.RightContent>
      </Row>
    ), mount);

    const row = mount.querySelector('.row');
    const titleRow = mount.querySelector('.row-title-row');

    expect(row.classList.contains('row-grid')).toBe(true);
    expect(titleRow.parentElement).toBe(row);
    expect(titleRow.querySelector('[data-grid-title-right]')).not.toBe(null);
    expect(titleRow.querySelector('[data-radio="right"]')).not.toBe(null);
    expect(row.querySelector(':scope > [data-row-action]')).not.toBe(null);
  });

  test('keeps a regular radio at the row root with left padding', () => {
    const mount = document.createElement('div');
    document.body.append(mount);

    dispose = render(() => (
      <Row>
        <Row.Title>Choice</Row.Title>
        <Row.RadioField>
          <label data-radio="left">
            <span class="radio-field-main" />
          </label>
        </Row.RadioField>
      </Row>
    ), mount);

    const row = mount.querySelector('.row');
    const radio = mount.querySelector('[data-radio="left"]');

    expect(radio.parentElement).toBe(row);
    expect(row.classList.contains('row-with-padding')).toBe(true);
    expect(row.querySelector('.row-title-right')).toBe(null);
  });
});
