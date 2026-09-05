import {afterEach, describe, expect, test, vi} from 'vitest';
import type {PeerSettings} from '@layer';
import '@helpers/peerIdPolyfill';
import createChatActionsPlate from '@components/chat/actions';

const mocks = vi.hoisted(() => ({
  setHidden: vi.fn()
}));

vi.mock('@components/chat/topbarPlate', () => ({
  default: {
    Body: (): null => null,
    CloseButton: (): null => null
  },
  createTopbarPlate: () => ({
    container: document.createElement('div'),
    height: 52,
    hidden: () => true,
    setHidden: mocks.setHidden,
    isVisible: () => false,
    destroy: vi.fn()
  })
}));

vi.mock('@components/ripple', () => ({
  default: vi.fn()
}));

vi.mock('@components/confirmationPopup', () => ({
  default: vi.fn()
}));

vi.mock('@components/popups', () => ({
  default: {
    createPopup: vi.fn()
  }
}));

vi.mock('@components/popups/peer', () => ({
  default: vi.fn()
}));

vi.mock('@components/popups/premium', () => ({
  default: {
    show: vi.fn()
  }
}));

vi.mock('@components/peerTitle', () => ({
  default: class {
    element = document.createElement('span');

    update() {}
  }
}));

vi.mock('@components/wrappers/peerTitle', () => ({
  default: vi.fn()
}));

vi.mock('@components/toast', () => ({
  toastNew: vi.fn()
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getUser: vi.fn()
  }
}));

vi.mock('@lib/rootScope', () => ({
  default: {
    myId: 1,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
}));

vi.mock('@components/wrappers/emojiStatus', () => ({
  default: vi.fn()
}));

vi.mock('@lib/richTextProcessor/wrapEmojiText', () => ({
  default: vi.fn((text: string) => document.createTextNode(text))
}));

vi.mock('@environment/webpSupport', () => ({
  default: true
}));

vi.mock('@lib/langPack', () => ({
  i18n: () => document.createTextNode(''),
  LangPackKey: {}
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('chat actions peer settings', () => {
  test('forwards settings without visible actions to message bubbles', () => {
    const peerId = 10 as PeerId;
    const settings = {
      _: 'peerSettings',
      pFlags: {}
    } as PeerSettings;
    const setPeerSettings = vi.fn();
    const plate = createChatActionsPlate(
      {setFloating: vi.fn()} as any,
      {bubbles: {setPeerSettings}} as any,
      {} as any
    );

    const apply = plate.set(peerId, settings);
    expect(setPeerSettings).not.toHaveBeenCalled();

    apply();

    expect(setPeerSettings).toHaveBeenCalledWith(peerId, settings);
    expect(mocks.setHidden).toHaveBeenLastCalledWith(true);
  });
});
