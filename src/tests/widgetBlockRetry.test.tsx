import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';

vi.mock('@lib/apiManagerProxy', () => ({default: new Proxy({}, {get: () => (): undefined => undefined})}));
// * a widget whose engine never comes: it failed to start
vi.mock('@lib/widgetSandbox/runtime', async(importOriginal) => ({
  ...(await importOriginal<typeof import('@lib/widgetSandbox/runtime')>()),
  isWidgetSandboxSupported: () => true,
  loadWidgetRuntime: () => Promise.reject(new Error('no engine'))
}));

/**
 * The control that starts a failed widget again is a native button only with the a11y layer: without it, a button
 * that takes the focus would hand Enter on to the chat's input, which sends the draft.
 */
describe('a failed widget\'s control to start it again', () => {
  let WidgetBlock: typeof import('@components/widgetSandbox/widgetBlock').default;
  let render: typeof import('solid-js/web').render;
  let Modes: typeof import('@config/modes').default;

  beforeAll(async() => {
    stubBrowserGlobals();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    WidgetBlock = (await import('@components/widgetSandbox/widgetBlock')).default;
    render = (await import('solid-js/web')).render;
    Modes = (await import('@config/modes')).default;
  }, 60_000);

  afterEach(() => {
    Modes.a11y = false;
    document.body.replaceChildren();
  });

  const mountFailed = async() => {
    const attachment = document.createElement('div');
    const dispose = render(() => WidgetBlock({html: '<div></div>', widgetKey: 'e2e:failed'}), attachment);
    document.body.append(attachment);
    for(let i = 0; i < 20 && !attachment.textContent.includes('Widget.Restart'); i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const control = [...attachment.querySelectorAll<HTMLElement>('*')].find((element) => {
      return element.childElementCount === 0 ? false : element.textContent === 'Widget.Restart' && element.classList.contains('rp');
    });
    return {control, dispose};
  };

  it('is no button without the layer: it takes no focus', async() => {
    const {control, dispose} = await mountFailed();
    expect(control).toBeDefined();
    expect(control.tagName).not.toBe('BUTTON');
    expect(control.tabIndex).toBe(-1);
    dispose();
  });

  it('is a native button with the layer', async() => {
    Modes.a11y = true;
    const {control, dispose} = await mountFailed();
    expect(control.tagName).toBe('BUTTON');
    expect((control as HTMLButtonElement).type).toBe('button');
    dispose();
  });
});
