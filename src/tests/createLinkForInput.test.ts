import openCreateLinkPopupForInput from '@components/popups/createLinkForInput';
import {registerChatInputEditor} from '@components/chat/inputEditor/registry';
import type {ChatInputEditor} from '@components/chat/inputEditor/types';

const mocks = vi.hoisted(() => ({
  showCreateLinkPopup: vi.fn()
}));

vi.hoisted(() => {
  class IntersectionObserverMock {
    disconnect() {}
    observe() {}
    unobserve() {}
  }

  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: IntersectionObserverMock
  });
});

vi.mock('@components/popups/createLink', () => ({
  default: mocks.showCreateLinkPopup
}));

describe('Create Link popup bridge for formatted inputs', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    mocks.showCreateLinkPopup.mockReset();
  });

  function mountInput() {
    const input = document.createElement('div');
    input.contentEditable = 'true';
    document.body.append(input);
    input.focus();
    return input;
  }

  test('opens the popup directly when an editor has no host callback', async() => {
    const input = mountInput();
    const selection = {from: 1, to: 5};
    const editor = {
      input,
      captureSelection: vi.fn(() => selection),
      getSelectedLink: vi.fn(() => undefined),
      getSelectedText: vi.fn(() => 'text'),
      replaceSelection: vi.fn(() => true),
      requestLinkEditor: vi.fn(() => false),
      restoreSelection: vi.fn()
    } as unknown as ChatInputEditor;
    const unregister = registerChatInputEditor(input, editor);
    mocks.showCreateLinkPopup.mockResolvedValue({
      text: 'text',
      url: 'https://new.example/'
    });

    await expect(openCreateLinkPopupForInput(input)).resolves.toBe(true);

    expect(editor.requestLinkEditor).toHaveBeenCalledTimes(1);
    expect(editor.restoreSelection).toHaveBeenCalledWith(selection, false);
    expect(editor.replaceSelection).toHaveBeenCalledWith('text', [{
      _: 'messageEntityTextUrl',
      length: 4,
      offset: 0,
      url: 'https://new.example/'
    }]);
    unregister();
  });

  test('does nothing for an input without the composer', async() => {
    const input = mountInput();

    // Every field that can be formatted mounts an editor; there is no
    // `document.execCommand` path behind this any more.
    await expect(openCreateLinkPopupForInput(input)).resolves.toBe(false);
    expect(mocks.showCreateLinkPopup).not.toHaveBeenCalled();
  });
});
