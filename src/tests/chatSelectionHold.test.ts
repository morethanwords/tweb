vi.hoisted(() => {
  vi.stubGlobal('Worker', class Worker {});
  vi.stubGlobal('IntersectionObserver', class IntersectionObserver {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
  });
  vi.stubGlobal('CSS', {supports: () => false});
});

// * what selection.ts pulls in and a page without the app cannot load (as chatSelectionInteraction.test.ts has it)
vi.mock('@components/button', () => ({default: () => document.createElement('button')}));
vi.mock('@components/buttonIcon', () => ({default: () => document.createElement('button')}));
vi.mock('@components/checkboxField', () => ({default: class CheckboxField {}}));
vi.mock('@components/popups/deleteMessages', () => ({default: class PopupDeleteMessages {}}));
vi.mock('@components/popups/forward', () => ({default: vi.fn()}));
vi.mock('@components/popups/reportAd', () => ({showSelectedMessagesReport: vi.fn()}));
vi.mock('@components/singleTransition', () => ({default: vi.fn()}));
vi.mock('@components/popups/sendNow', () => ({default: class PopupSendNow {}}));
vi.mock('@components/appNavigationController', () => ({default: {pushItem: vi.fn(), removeByType: vi.fn()}}));
vi.mock('@environment/touchSupport', () => ({default: false}));
vi.mock('@lib/langPack', () => ({default: {format: (key: string) => key}, i18n: (key: string) => document.createTextNode(key), _i18n: vi.fn()}));
vi.mock('@helpers/dom/clickEvent', () => ({attachClickEvent: vi.fn()}));
vi.mock('@helpers/dom/attachContextMenuListener', () => ({attachContextMenuListener: vi.fn()}));
vi.mock('@lib/appImManager', () => ({default: {}}));
vi.mock('@components/popups', () => ({default: class PopupElement {}}));
vi.mock('@environment/standalone', () => ({default: false}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));
vi.mock('@components/confirmationPopup', () => ({default: vi.fn()}));
vi.mock('@components/chat/controlPlate', () => ({default: () => document.createElement('div')}));

import ListenerSetter from '@helpers/listenerSetter';
import '@helpers/peerIdPolyfill';
import {AppSelection} from '@components/chat/selection';

/** A press of `pointerType` let go (`pointerup`) or taken away (`pointercancel`) where the pointer is. */
const pointerEnd = (type: 'pointerup' | 'pointercancel', pointerType: string) =>
  Object.assign(new Event(type, {bubbles: true, cancelable: true}), {pointerType});

describe('a hold that starts a selection', () => {
  let root: HTMLElement, target: HTMLElement, release: () => void;

  beforeEach(() => {
    root = document.createElement('div');
    target = document.createElement('div');
    root.append(target);
    document.body.append(root);
    const selection = new AppSelection({
      managers: {} as any,
      getElementFromTarget: () => undefined,
      targetLookupClassName: 'bubble',
      lookupBetweenParentClassName: 'bubbles-inner',
      lookupBetweenElementsQuery: '.bubble'
    });
    selection.attachListeners(root, new ListenerSetter());
    release = selection.holdOn(target);
    expect(release).toBeTypeOf('function');
    expect(document.body.classList.contains('no-select')).toBe(true);
  });

  afterEach(() => {
    document.body.replaceChildren();
    document.body.className = '';
  });

  it('lets the page\'s text be selected again as a pen is let go, wherever', () => {
    document.body.dispatchEvent(pointerEnd('pointerup', 'pen'));
    expect(document.body.classList.contains('no-select')).toBe(false);
  });

  it('does so as a pen\'s or a mouse\'s press is taken away', () => {
    target.dispatchEvent(pointerEnd('pointercancel', 'mouse'));
    expect(document.body.classList.contains('no-select')).toBe(false);
  });

  it('waits for a finger\'s touchend, which it cancels', () => {
    target.dispatchEvent(pointerEnd('pointerup', 'touch'));
    expect(document.body.classList.contains('no-select')).toBe(true);

    const touchEnd = new Event('touchend', {bubbles: true, cancelable: true});
    target.dispatchEvent(touchEnd);
    expect(touchEnd.defaultPrevented).toBe(true);
    expect(document.body.classList.contains('no-select')).toBe(false);

    // * once: the next touch is the page's
    const next = new Event('touchend', {bubbles: true, cancelable: true});
    target.dispatchEvent(next);
    expect(next.defaultPrevented).toBe(false);
  });

  it('ends where the press is let go out of the document\'s sight (a widget\'s frame), and only once', () => {
    release();
    expect(document.body.classList.contains('no-select')).toBe(false);
    // * what it listened for is gone with it: the next touch is the page's
    const touchEnd = new Event('touchend', {bubbles: true, cancelable: true});
    target.dispatchEvent(touchEnd);
    expect(touchEnd.defaultPrevented).toBe(false);
    release();
    expect(document.body.classList.contains('no-select')).toBe(false);
  });

  it('ends with a touch the browser takes away', () => {
    target.dispatchEvent(new Event('touchcancel', {bubbles: true}));
    expect(document.body.classList.contains('no-select')).toBe(false);
  });
});
