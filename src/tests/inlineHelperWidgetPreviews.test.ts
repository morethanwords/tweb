import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';

vi.mock('@lib/apiManagerProxy', () => ({default: new Proxy({}, {get: () => (): undefined => undefined})}));
vi.mock('@lib/widgetSandbox/payload', () => ({
  whenWidgetRenderingEnabled: () => true,
  getWidgetSource: () => Promise.resolve('<div></div>')
}));
vi.mock('@lib/widgetSandbox/messageWidget', () => ({getWidgetData: () => ({})}));
vi.mock('@lib/widgetSandbox/runtime', async(importOriginal) => ({
  ...(await importOriginal<typeof import('@lib/widgetSandbox/runtime')>()),
  isWidgetSandboxSupported: () => true
}));

/**
 * The widget previews of an inline bot's results go with the set they are of: as the helper hides (another helper's
 * suggestions taking its place), or shows the next set.
 */
describe('the inline helper\'s widget previews', () => {
  let InlineHelper: typeof import('@components/chat/inlineHelper').default;
  let AutocompleteHelper: typeof import('@components/chat/autocompleteHelper').default;
  let AutocompleteHelperController: typeof import('@components/chat/autocompleteHelperController').default;
  // * the previews alive: each registers its playback with the chat's animations, and takes it back as it goes
  const previews = {mounted: 0, disposed: 0};

  beforeAll(async() => {
    stubBrowserGlobals();
    const {default: animationIntersector} = await import('@components/animationIntersector');
    const add = animationIntersector.addAnimation.bind(animationIntersector);
    const remove = animationIntersector.removeAnimationByPlayer.bind(animationIntersector);
    const widgets = new Set<unknown>();
    vi.spyOn(animationIntersector, 'addAnimation').mockImplementation((options) => {
      if(options.type === 'widget') {
        widgets.add(options.animation);
        ++previews.mounted;
      }
      return add(options);
    });
    vi.spyOn(animationIntersector, 'removeAnimationByPlayer').mockImplementation((animation) => {
      if(widgets.delete(animation)) ++previews.disposed;
      return remove(animation);
    });
    InlineHelper = (await import('@components/chat/inlineHelper')).default;
    AutocompleteHelper = (await import('@components/chat/autocompleteHelper')).default;
    AutocompleteHelperController = (await import('@components/chat/autocompleteHelperController')).default;
  }, 60_000);

  const widgetResult = (id: string) => ({
    _: 'botInlineResult',
    id,
    type: 'article',
    title: 'Widget ' + id,
    send_message: {_: 'botInlineMessageWidget', pFlags: {}, width: 0, height: 0, payload: new Uint8Array([1])}
  });

  const setUp = () => {
    const appendTo = document.createElement('div');
    document.body.append(appendTo);
    const controller = new AutocompleteHelperController();
    const managers: any = {
      appUsersManager: {resolveUsername: () => Promise.resolve({_: 'user', id: 7, pFlags: {bot: true}})},
      appInlineBotsManager: {getInlineResults: () => Promise.resolve({query_id: 1, pFlags: {}, results: [widgetResult('a'), widgetResult('b')]})}
    };
    const helper = new InlineHelper(appendTo, controller, {} as any, managers);
    const other = new AutocompleteHelper({appendTo, controller, listType: 'y', onSelect: () => true});
    return {controller, helper, other};
  };

  // * the previews load their code first
  const settle = async(mounted: number) => {
    for(let i = 0; i < 200 && previews.mounted < mounted; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  };

  afterEach(() => {
    previews.mounted = previews.disposed = 0;
    document.body.replaceChildren();
  });

  it('go as another helper\'s suggestions take its place', async() => {
    const {controller, helper, other} = setUp();
    const {renderPromise} = await helper._checkQuery(10 as PeerId, 'bot', 'q', true);
    await renderPromise;
    await settle(2);
    expect(previews.mounted).toBe(2);
    expect(previews.disposed).toBe(0);

    // * an emoji's suggestions now: the inline helper hides
    controller.hideOtherHelpers(new Set([other]));
    expect(previews.disposed).toBe(2);
  });

  it('go as the next set of results is shown', async() => {
    const {helper} = setUp();
    await (await helper._checkQuery(10 as PeerId, 'bot', 'q', true)).renderPromise;
    await settle(2);
    await (await helper._checkQuery(10 as PeerId, 'bot', 'qu', true)).renderPromise;
    await settle(4);
    expect(previews.mounted).toBe(4);
    expect(previews.disposed).toBe(2);
  });
});
