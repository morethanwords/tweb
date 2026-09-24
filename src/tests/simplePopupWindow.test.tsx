import {afterEach, expect, it, vi} from 'vitest';
import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {setAppWindow} from '@helpers/appWindow';

vi.mock('@lib/langPack', () => ({i18n: (key: string) => document.createTextNode(key)}));
vi.mock('@components/ripple', () => ({default: () => {}}));

import SimplePopup from '@components/passcodeLock/simplePopup';

let dispose: VoidFunction;
afterEach(() => {
  dispose?.();
  setAppWindow(window);
  document.body.replaceChildren();
});

it('keeps the passcode confirmation Escape handler in the document containing the client', async() => {
  const iframe = document.createElement('iframe');
  const host = document.createElement('div');
  document.body.append(iframe, host);
  const [visible, setVisible] = createSignal(true);
  const close = vi.fn(() => setVisible(false));
  dispose = render(() => <SimplePopup visible={visible()} title="Confirm" description="Local fixture"
    confirmButtonContent="Confirm" onConfirm={vi.fn()} onClose={close} />, host);
  const popup = document.querySelector<HTMLElement>('.popup');
  const portal = popup.parentElement;
  setAppWindow(iframe.contentWindow);
  iframe.contentDocument.body.append(portal);
  await Promise.resolve();
  popup.querySelector('button').dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
  expect(close).toHaveBeenCalledOnce();
  expect(visible()).toBe(false);
});
