import {afterEach, expect, it, vi} from 'vitest';
import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';

vi.mock('@lib/apiManagerProxy', () => ({default: {getState: vi.fn()}}));
vi.mock('@lib/rootScope', () => ({default: {managers: {appStateManager: {setByKey: vi.fn()}}}}));
vi.mock('@components/icon', () => ({default: () => document.createElement('span')}));
vi.mock('@components/ripple', () => ({default: () => ({dispose: vi.fn(), element: document.createElement('div')})}));
vi.mock('@helpers/solid/heightTransition', () => ({HeightTransition: (props: any) => props.children}));
vi.mock('@lib/langPack', () => ({default: {format: (key: string) => key}}));

import {ExpandableFilterGroup} from '@components/sidebarRight/tabs/adminRecentActions/filters/expandableFilterGroup';
import {LogEntry} from '@components/sidebarRight/tabs/adminRecentActions/logEntry';

let dispose: VoidFunction;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});

it('keeps filter selection separate from expanding its group and labels the native inputs', () => {
  const [checked, setChecked] = createSignal(false);
  const select = vi.fn(() => setChecked((value) => !value));
  dispose = render(() => (
    <ExpandableFilterGroup
      mainLabel="Members"
      checkedCount={checked() ? 1 : 0}
      onMainCheckboxClick={select}
      items={[{checked, label: 'Joined', onClick: select}]}
    />
  ), document.body);
  const groupCheckbox = document.querySelector<HTMLInputElement>('input');
  const expand = document.querySelector('button');
  expect(document.getElementById(groupCheckbox.getAttribute('aria-labelledby')).textContent).toBe('Members');
  groupCheckbox.click();
  expect(select).toHaveBeenCalledOnce();
  expect(expand.getAttribute('aria-expanded')).toBe('false');
  expand.click();
  expect(expand.getAttribute('aria-expanded')).toBe('true');
  const item = document.querySelectorAll<HTMLInputElement>('input')[1];
  const label = document.querySelector<HTMLLabelElement>(`label[for="${item.id}"]`);
  expect(label.textContent).toBe('Joined');
  label.click();
  expect(select).toHaveBeenCalledTimes(2);
  expect(item.checked).toBe(false);
  expect(document.querySelector('[role="checkbox"] input')).toBeNull();
});

it('opens an event peer without also expanding the event', () => {
  const peer = vi.fn();
  const expand = vi.fn();
  dispose = render(() => (
    <LogEntry date={new Date()} peerTitle="Alice" message="Joined" icon="add"
      onPeerTitleClick={peer} onExpandedChange={expand} />
  ), document.body);
  const [details, openPeer] = document.querySelectorAll('button');
  openPeer.click();
  expect(peer).toHaveBeenCalledOnce();
  expect(expand).not.toHaveBeenCalled();
  details.click();
  expect(expand).toHaveBeenCalledExactlyOnceWith(true);
  expect(document.querySelector('button button, [role="button"] button')).toBeNull();
});
