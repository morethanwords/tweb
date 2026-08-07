vi.hoisted(() => {
  vi.stubGlobal('Worker', class Worker {});
  vi.stubGlobal('IntersectionObserver', class IntersectionObserver {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
  });
  vi.stubGlobal('CSS', {supports: () => false});
});

vi.mock('@components/button', () => ({default: () => document.createElement('button')}));
vi.mock('@components/buttonIcon', () => ({default: () => document.createElement('button')}));
vi.mock('@components/checkboxField', () => ({
  default: class CheckboxField {
    public input = document.createElement('input');
    public label = document.createElement('label');

    constructor() {
      this.label.append(this.input);
    }
  }
}));
vi.mock('@components/popups/deleteMessages', () => ({default: class PopupDeleteMessages {}}));
vi.mock('@components/popups/forward', () => ({default: vi.fn()}));
vi.mock('@components/popups/reportAd', () => ({showSelectedMessagesReport: vi.fn()}));
vi.mock('@components/singleTransition', () => ({
  default: ({element, className, forwards}: {
    element: HTMLElement,
    className: string,
    forwards: boolean
  }) => element.classList.toggle(className, forwards)
}));
vi.mock('@components/popups/sendNow', () => ({default: class PopupSendNow {}}));
vi.mock('@components/appNavigationController', () => ({
  default: {
    pushItem: vi.fn(),
    removeByType: vi.fn()
  }
}));
vi.mock('@environment/touchSupport', () => ({default: false}));
vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key),
  _i18n: vi.fn()
}));
vi.mock('@helpers/dom/clickEvent', () => ({attachClickEvent: vi.fn()}));
vi.mock('@helpers/dom/attachContextMenuListener', () => ({attachContextMenuListener: vi.fn()}));
vi.mock('@lib/appImManager', () => ({default: {}}));
vi.mock('@components/popups', () => ({
  default: class PopupElement {
    public static createPopup = vi.fn();
  }
}));
vi.mock('@environment/standalone', () => ({default: false}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));
vi.mock('@components/confirmationPopup', () => ({default: vi.fn()}));
vi.mock('@components/chat/controlPlate', () => ({default: () => document.createElement('div')}));

import ListenerSetter from '@helpers/listenerSetter';
import '@helpers/peerIdPolyfill';
import ChatSelection from '@components/chat/selection';

const rect = (top: number) => ({
  x: 0,
  y: top,
  top,
  right: 100,
  bottom: top + 40,
  left: 0,
  width: 100,
  height: 40,
  toJSON: () => ({})
});

const flushPromises = async() => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('chat album pointer drag selection', () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.body.className = '';
  });

  const createHarness = () => {
    const peerId = (1 as UserId).toPeerId(false);
    const root = document.createElement('div');
    root.classList.add('bubbles-inner');

    const album = document.createElement('div');
    album.classList.add('bubble', 'is-album', 'is-grouped');
    album.dataset.mid = '101';
    album.dataset.peerId = String(peerId);
    album.getBoundingClientRect = () => rect(100);

    const createItem = (mid: number, top: number) => {
      const item = document.createElement('div');
      item.classList.add('grouped-item');
      item.dataset.mid = '' + mid;
      item.dataset.peerId = String(peerId);
      item.getBoundingClientRect = () => rect(top);
      return item;
    };

    const firstItem = createItem(101, 100);
    const secondItem = createItem(102, 140);
    const thirdItem = createItem(103, 180);
    album.append(firstItem, secondItem, thirdItem);

    const text = document.createElement('div');
    text.classList.add('bubble');
    text.dataset.mid = '104';
    text.dataset.peerId = String(peerId);
    text.getBoundingClientRect = () => rect(240);
    root.append(album, text);
    document.body.append(root);

    const bubbles = {
      getBubbleGroupedItems: (bubble: HTMLElement) => {
        return Array.from(bubble.querySelectorAll('.grouped-item')) as HTMLElement[];
      },
      getRenderedHistory: (): string[] => [],
      skippedMids: new Set(),
      getBubble: vi.fn()
    };
    const input = {
      center: vi.fn().mockResolvedValue(undefined),
      chatInput: document.createElement('div'),
      inputContainer: document.createElement('div')
    };
    const chat = {input, bubbles};
    const managers = {
      appMessagesManager: {
        cantForwardDeleteMids: vi.fn().mockResolvedValue({
          cantForward: false,
          cantDelete: false
        })
      }
    };
    const selection = new ChatSelection(chat as any, bubbles as any, input as any, managers as any);
    selection.attachListeners(root, new ListenerSetter());

    const drag = async(...elements: HTMLElement[]) => {
      elements[0].dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
      elements.forEach((element) => element.dispatchEvent(new MouseEvent('mousemove', {bubbles: true})));
      document.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
      await flushPromises();
    };

    return {album, firstItem, secondItem, thirdItem, text, selection, drag};
  };

  it('selects album to text and deselects text to album', async() => {
    const {album, text, selection, drag} = createHarness();

    await drag(album, text);
    expect(selection.getSelectedMids()).toEqual([101, 102, 103, 104]);

    await drag(text, album);
    expect(selection.getSelectedMids()).toEqual([]);
  });

  it('selects text to album and deselects album to text', async() => {
    const {album, text, selection, drag} = createHarness();

    await drag(text, album);
    expect(selection.getSelectedMids()).toEqual([101, 102, 103, 104]);

    await drag(album, text);
    expect(selection.getSelectedMids()).toEqual([]);
  });

  it('does not select anything while the pointer stays inside one album', async() => {
    const {album, secondItem, thirdItem, selection, drag} = createHarness();

    await drag(album, secondItem, thirdItem);
    expect(selection.getSelectedMids()).toEqual([]);
  });

  it('selects the album only once the pointer leaves it', async() => {
    const {album, secondItem, text, selection, drag} = createHarness();

    await drag(album, secondItem, text);
    expect(selection.getSelectedMids()).toEqual([101, 102, 103, 104]);
  });

  it('keeps an item range granular when the pointer crosses the album itself', async() => {
    const {album, secondItem, thirdItem, text, selection, drag} = createHarness();

    selection.toggleByElement(text);
    await flushPromises();

    await drag(secondItem, album, thirdItem);
    expect(selection.getSelectedMids()).toEqual([102, 103, 104]);
  });
});
