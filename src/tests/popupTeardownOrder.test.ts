import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@components/animationIntersector', () => ({
  default: {checkAnimations2: vi.fn(), setOnlyOnePlayableGroup: vi.fn()}
}));

vi.mock('@components/appNavigationController', () => ({
  default: {pushItem: vi.fn(), backByItem: vi.fn(), removeItem: vi.fn()}
}));

vi.mock('@components/chat/markupTooltip', () => ({
  default: {getInstance: () => ({hide: vi.fn()})}
}));

vi.mock('@components/scrollable', () => ({default: class Scrollable {}}));

vi.mock('@components/ripple', () => ({default: vi.fn()}));

vi.mock('@components/icon', () => ({
  default: () => document.createElement('span'),
  getIconContent: (icon: string) => icon
}));

vi.mock('@components/buttonIcon', () => ({
  default: () => document.createElement('button')
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key),
  _i18n: (element: HTMLElement, key: string) => {
    element.textContent = key;
  }
}));

vi.mock('@helpers/appWindow', () => ({
  getOverlayRoot: () => document.body,
  getAppWindow: () => window,
  onAppWindowChange: vi.fn()
}));

import PopupElement from '@components/popups';

type Phase = {name: string, connected: boolean};

describe('PopupElement teardown order', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('stops listening at close but keeps rendering until the popup leaves the DOM', () => {
    vi.useFakeTimers();

    try {
      const popup = new PopupElement('popup-test', {closable: true, body: true});
      const internals = popup as any;
      document.body.append(internals.element);

      const phases: Phase[] = [];
      const track = (name: string) => phases.push({name, connected: internals.element.isConnected});

      // captured up front: the helper hands out a FRESH middleware after a clean
      const middleware = internals.middlewareHelper.get();
      internals.listenerSetter.addCleanup(() => track('listeners'));
      middleware.onDestroy(() => track('render'));
      popup.addEventListener('close', () => track('close'));
      popup.addEventListener('closeAfterTimeout', () => track('closeAfterTimeout'));

      popup.forceHide();

      // events stop immediately - the popup is closed even though it is still fading out
      expect(phases).toEqual([
        {name: 'close', connected: true},
        {name: 'listeners', connected: true}
      ]);
      // ...but its Solid content is still mounted and reactive
      expect(middleware()).toBe(true);

      vi.advanceTimersByTime(250);

      expect(phases.map((phase) => phase.name)).toEqual([
        'close',
        'listeners',
        'closeAfterTimeout',
        'render'
      ]);
      // the render teardown may only run once the element is gone
      expect(phases[3]).toEqual({name: 'render', connected: false});
      expect(middleware()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the previous set of buttons handlers when the buttons are replaced', () => {
    const popup = new PopupElement('popup-test', {closable: true, body: true});
    const internals = popup as any;

    const first = vi.fn();
    internals.setButtons([{langKey: 'Cancel', callback: first}]);
    const firstButton = internals.buttons[0].element as HTMLButtonElement;

    internals.setButtons([{langKey: 'OK', callback: vi.fn()}]);

    // `attachClickEvent` listens on mousedown or click depending on touch support
    firstButton.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
    firstButton.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    expect(first).not.toHaveBeenCalled();
  });
});
