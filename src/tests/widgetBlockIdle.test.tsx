import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';

const runtime = vi.hoisted(() => ({inits: [] as {visible?: boolean}[], frame: false}));
vi.mock('@lib/apiManagerProxy', () => ({default: new Proxy({}, {get: () => (): undefined => undefined})}));
vi.mock('@lib/widgetSandbox/theme', () => ({getWidgetTheme: () => ({}), watchChatTheme: (): undefined => undefined}));
vi.mock('@helpers/themeController', () => ({default: {isNight: () => false}}));
// * a widget that starts in its place (`inline`), on a host that only notes what it was made with: drawn on a shadow
// * root, or (`frame`) in a frame
vi.mock('@lib/widgetSandbox/runtime', async(importOriginal) => ({
  ...(await importOriginal<typeof import('@lib/widgetSandbox/runtime')>()),
  isWidgetSandboxSupported: () => true,
  resolveWidgetTransport: () => 'inline',
  loadWidgetRuntime: () => Promise.resolve({
    prepare: () => Promise.resolve(undefined),
    createHost: (container: HTMLElement, _html: string, init: {visible?: boolean}) => {
      runtime.inits.push(init);
      const element = document.createElement(runtime.frame ? 'iframe' : 'div');
      container.append(element);
      const noop = (): undefined => undefined;
      return {
        element,
        watchesPublicData: false,
        resizeAnchor: 'top',
        setVisible: noop,
        destroy: noop,
        rebind: noop,
        setTheme: noop,
        setData: noop,
        setContentSafeArea: noop,
        setBubbleGestures: noop,
        suspend: noop
      };
    }
  })
}));

describe('a widget mounted', () => {
  let WidgetBlock: typeof import('@components/widgetSandbox/widgetBlock').default;
  let render: typeof import('solid-js/web').render;
  let idleController: typeof import('@helpers/idleController').default;

  beforeAll(async() => {
    stubBrowserGlobals();
    WidgetBlock = (await import('@components/widgetSandbox/widgetBlock')).default;
    render = (await import('solid-js/web')).render;
    idleController = (await import('@helpers/idleController')).default;
  }, 60_000);

  afterEach(() => {
    runtime.inits.length = 0;
    runtime.frame = false;
    document.body.replaceChildren();
  });

  const mount = async(props: Partial<Parameters<typeof WidgetBlock>[0]> = {}) => {
    const attachment = document.createElement('div');
    const dispose = render(() => WidgetBlock({html: '<div></div>', widgetKey: 'e2e:mounted', ...props}), attachment);
    document.body.append(attachment);
    for(let i = 0; i < 20 && !runtime.inits.length; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    return {attachment, dispose};
  };

  it('while the window is idle starts as the others are then: paused, nothing it does seen', async() => {
    idleController.isIdle = true;
    const {dispose} = await mount();
    expect(runtime.inits).toHaveLength(1);
    expect(runtime.inits[0].visible).toBe(false);
    dispose();
  });

  it('while the window is in use starts playing', async() => {
    idleController.isIdle = false;
    const {dispose} = await mount();
    expect(runtime.inits[0].visible).toBe(true);
    dispose();
    idleController.isIdle = true;
  });

  it('in a chat kept behind another (a thread open over it) starts paused', async() => {
    idleController.isIdle = false;
    const animationIntersector = (await import('@components/animationIntersector')).default;
    animationIntersector.toggleIntersectionGroup('chat-77', true);
    const {dispose} = await mount({chat: {animationGroup: 'chat-77'} as any});
    expect(runtime.inits[0].visible).toBe(false);
    dispose();
    animationIntersector.toggleIntersectionGroup('chat-77', false);
    idleController.isIdle = true;
  });

  it('that goes while a press of it holds the message\'s selection ends the hold', async() => {
    const release = vi.fn();
    const selection = {holdOn: vi.fn(() => release), isSelecting: false, addEventListener: vi.fn(), removeEventListener: vi.fn()};
    const {attachment, dispose} = await mount({chat: {animationGroup: 'chat-78', selection} as any});
    attachment.classList.add('bubble');
    const init = runtime.inits[0] as any;
    init.onBubbleGesture({action: 'select', gesture: 'hold', x: 0, y: 0, edge: false});
    expect(selection.holdOn).toHaveBeenCalledWith(attachment);
    // * the bubble goes with the finger still down: no release will come from the widget
    dispose();
    expect(release).toHaveBeenCalledTimes(1);
    // * and once only
    init.onRelease();
    expect(release).toHaveBeenCalledTimes(1);
  });

  const holdIt = async() => {
    const release = vi.fn();
    const selection = {holdOn: vi.fn(() => release), isSelecting: false, addEventListener: vi.fn(), removeEventListener: vi.fn()};
    const {attachment, dispose} = await mount({chat: {animationGroup: 'chat-79', selection} as any});
    attachment.classList.add('bubble');
    const init = runtime.inits[0] as any;
    init.onBubbleGesture({action: 'select', gesture: 'hold', x: 0, y: 0, edge: false});
    return {release, init, dispose};
  };

  it('drawn on a shadow root leaves a finger\'s hold to the page, whose touchend comes after the press\'s release', async() => {
    const {release, init, dispose} = await holdIt();
    // * the renderer's release, on the finger's pointerup: the hold still has the touchend to cancel
    init.onRelease();
    expect(release).not.toHaveBeenCalled();
    // * gone with the finger still down, it ends the hold
    dispose();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('drawn in a frame ends the hold as the press is let go there: the page sees nothing of it', async() => {
    runtime.frame = true;
    const {release, init, dispose} = await holdIt();
    init.onRelease();
    expect(release).toHaveBeenCalledTimes(1);
    dispose();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('takes its own presses while it runs; a stopped one\'s picture leaves them to the bubble', async() => {
    const {attachment, dispose} = await mount();
    const init = runtime.inits[0] as any;
    init.onLoaded();
    const reached: string[] = [];
    for(const type of ['mousedown', 'click', 'dblclick']) attachment.addEventListener(type, () => reached.push(type));
    const press = () => {
      const target = attachment.querySelector('tweb-widget-slot').firstElementChild.firstElementChild;
      for(const type of ['mousedown', 'click', 'dblclick']) target.dispatchEvent(new MouseEvent(type, {bubbles: true}));
    };
    press();
    expect(reached).toEqual([]);
    // * it dies: what is left is its picture
    init.onDead('crashed');
    press();
    expect(reached).toEqual(['mousedown', 'click', 'dblclick']);
    dispose();
  });

  it('as an inline result\'s preview takes no keyboard stops: its frame is inert', async() => {
    const {attachment, dispose} = await mount({context: {preview: true} as any});
    const slot = attachment.querySelector('tweb-widget-slot') as HTMLElement;
    expect(slot.inert).toBe(true);
    dispose();
  });
});
