import '@/tests/mocks/chatInputIntegrationUi';
import {AppImManager} from '@lib/appImManager';
import Modes from '@config/modes';

const callbacks = vi.hoisted(() => [] as Array<(event: KeyboardEvent) => Promise<void>>);
vi.mock('@helpers/appWindow', async(importOriginal) => ({
  ...await importOriginal<typeof import('@helpers/appWindow')>(),
  bindActiveWindowListener: (_target: unknown, type: string, callback: (event: KeyboardEvent) => Promise<void>) => {
    if(type === 'keydown') callbacks.push(callback);
    return () => {};
  }
}));

afterEach(() => {
  Modes.a11y = false;
});

function attachHandler() {
  const redirect = vi.fn();
  const input = document.createElement('div');
  Object.defineProperty(input, 'isContentEditable', {value: true});
  const host = {
    chat: {input: {messageInput: input, passEventToInput: redirect}, selection: {isSelecting: false}}
  };
  callbacks.length = 0;
  (AppImManager.prototype as unknown as {attachKeydownListener(): void}).attachKeydownListener.call(host);
  const handler = callbacks[callbacks.length - 1];
  expect(handler).toBeDefined();
  return {handler, redirect};
}

test('native controls retain keyboard activation instead of sending the chat draft', async() => {
  Modes.a11y = true; // the keyboard and screen-reader layer, off unless ?a11y=1
  const {handler, redirect} = attachHandler();
  for(const html of ['<button>Bold</button>', '<button><span>Icon</span></button>', '<select><option>Language</option></select>', '<input type="checkbox">', '<a href="#">Link</a>', '<div role="button">Action</div>']) {
    const container = document.createElement('div');
    container.innerHTML = html;
    const target = container.querySelector('span') || container.firstElementChild;
    await handler({key: 'Enter', code: 'Enter', target, isTrusted: true, defaultPrevented: false} as unknown as KeyboardEvent);
    expect(redirect).not.toHaveBeenCalled();
  }
  const target = document.createElement('div');
  await handler({key: 'Enter', code: 'Enter', target, isTrusted: true, defaultPrevented: true} as unknown as KeyboardEvent);
  expect(redirect).not.toHaveBeenCalled();
  await handler({key: 'Enter', code: 'Enter', target, isTrusted: true, defaultPrevented: false} as unknown as KeyboardEvent);
  expect(redirect).toHaveBeenCalledTimes(1);
});

test('without the a11y layer the keys still go to the composer from a focused control, as before it', async() => {
  const {handler, redirect} = attachHandler();
  const container = document.createElement('div');
  container.innerHTML = '<button>Bold</button>';
  await handler({key: 'Enter', code: 'Enter', target: container.firstElementChild, isTrusted: true, defaultPrevented: false} as unknown as KeyboardEvent);
  expect(redirect).toHaveBeenCalledTimes(1);
});
