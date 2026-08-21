import {afterEach, describe, expect, test, vi} from 'vitest';
import {render} from 'solid-js/web';
import {getIconContent} from '@components/icon';
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
