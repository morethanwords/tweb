import {expect, it, vi} from 'vitest';
import {Portal, render} from 'solid-js/web';

it('creates a portal container in the mount ownerDocument', () => {
  const host = document.createElement('div');
  document.body.append(host);

  const targetDocument = document.implementation.createHTMLDocument('Document PiP');
  const createElement = vi.spyOn(targetDocument, 'createElement');
  const dispose = render(() => (
    <Portal mount={targetDocument.body}>
      <button>Confirm</button>
    </Portal>
  ), host);

  expect(createElement).toHaveBeenCalledWith('div');
  expect(targetDocument.body.firstElementChild?.ownerDocument).toBe(targetDocument);

  dispose();
  host.remove();
});

it('recognizes and renders into a head from another realm', () => {
  const host = document.createElement('div');
  const iframe = document.createElement('iframe');
  document.body.append(host);
  document.body.append(iframe);
  const targetHead = iframe.contentDocument.head as unknown as HTMLHeadElement;

  expect(targetHead instanceof HTMLHeadElement).toBe(false);

  const dispose = render(() => (
    <Portal mount={targetHead}>
      <meta name="portal-owner-document-test" content="ok" />
    </Portal>
  ), host);

  expect(targetHead.querySelector('meta[name="portal-owner-document-test"]')?.getAttribute('content')).toBe('ok');
  expect(targetHead.querySelector('div')).toBeNull();

  dispose();
  iframe.remove();
  host.remove();
});

it('disposes an adopted portal from its current parent', () => {
  const host = document.createElement('div');
  const mount = document.createElement('div');
  const iframe = document.createElement('iframe');
  document.body.append(host, mount, iframe);
  const dispose = render(() => <Portal mount={mount}><button>Confirm</button></Portal>, host);
  const container = mount.firstElementChild;
  iframe.contentDocument.body.append(container);
  expect(() => dispose()).not.toThrow();
  expect(container.isConnected).toBe(false);
  host.remove();
  mount.remove();
  iframe.remove();
});
