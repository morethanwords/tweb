import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';

vi.mock('@lib/apiManagerProxy', () => ({default: new Proxy({}, {get: () => (): undefined => undefined})}));
// * the engine and the storage still coming: the runtime never loads here
vi.mock('@lib/widgetSandbox/runtime', async(importOriginal) => ({
  ...(await importOriginal<typeof import('@lib/widgetSandbox/runtime')>()),
  isWidgetSandboxSupported: () => true,
  loadWidgetRuntime: () => new Promise(() => {})
}));

/**
 * A widget whose bubble the chat put in without waiting any longer for it (its media wait ran out) while the engine or
 * the storage are still coming: its placeholder keeps the place, at the height the widget is known to take, rather than
 * the block collapsing to nothing and jumping as the widget comes.
 */
describe('a widget that enters its chat before its start is prepared', () => {
  let WidgetBlock: typeof import('@components/widgetSandbox/widgetBlock').default;
  let render: typeof import('solid-js/web').render;
  let rememberWidgetHeight: typeof import('@lib/widgetSandbox/sizing').rememberWidgetHeight;

  beforeAll(async() => {
    stubBrowserGlobals();
    WidgetBlock = (await import('@components/widgetSandbox/widgetBlock')).default;
    render = (await import('solid-js/web')).render;
    rememberWidgetHeight = (await import('@lib/widgetSandbox/sizing')).rememberWidgetHeight;
  }, 60_000);

  it('shows its placeholder at the height it is known to take', async() => {
    rememberWidgetHeight('e2e:preparing', 240);
    const loadPromises: Promise<unknown>[] = [];
    const attachment = document.createElement('div');
    const dispose = render(() => WidgetBlock({html: '<div></div>', widgetKey: 'e2e:preparing', loadPromises}), attachment);
    const block = attachment.firstElementChild as HTMLElement;
    // * the chat waits for it, and gives up: the bubble goes in
    expect(loadPromises).toHaveLength(1);
    document.body.append(attachment);
    await Promise.resolve();

    expect(block.getAttribute('aria-busy')).toBe('true');
    expect(block.style.getPropertyValue('--widget-height')).toBe('240px');
    expect(block.childElementCount).toBe(2); // * its slot, and the placeholder over it
    dispose();
    attachment.remove();
  });
});
