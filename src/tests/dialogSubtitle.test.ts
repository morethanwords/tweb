import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  wrapMessageForReply: vi.fn()
}));

vi.mock('@components/wrappers/messageForReply', () => ({
  default: mocks.wrapMessageForReply
}));

vi.mock('@components/icon', () => ({
  default: (icon: string) => {
    const element = document.createElement('span');
    element.dataset.icon = icon;
    return element;
  }
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key)
}));

import renderDialogSubtitleParts
from '@components/wrappers/dialogSubtitle';

describe('renderDialogSubtitleParts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.wrapMessageForReply.mockImplementation(async({message}) => {
      const fragment = document.createDocumentFragment();
      fragment.append(
        message._ === 'messageService' ?
          'service preview' :
          message.message
      );
      return fragment;
    });
  });

  it('uses the shared message renderer for service messages', async() => {
    const message = {
      _: 'messageService',
      pFlags: {},
      peerId: (-1) as PeerId,
      fromId: (-1) as PeerId,
      mid: 1,
      date: 1,
      action: {_: 'messageActionChatCreate'}
    } as any;

    const parts = await renderDialogSubtitleParts({
      peerId: message.peerId,
      isSaved: false,
      lastMessage: message,
      middleware: (value) => value,
      textColor: 'secondary-text-color'
    });

    expect(mocks.wrapMessageForReply).toHaveBeenCalledWith(
      expect.objectContaining({message})
    );
    expect(parts.map((part) => part.textContent).join(''))
    .toBe('service preview');
  });

  it('keeps the standard Draft prefix and renders draft text once', async() => {
    const draftMessage = {
      _: 'draftMessage',
      pFlags: {},
      date: 1,
      message: 'draft body'
    } as any;

    const parts = await renderDialogSubtitleParts({
      peerId: (-1) as PeerId,
      isSaved: false,
      draftMessage,
      middleware: (value) => value,
      textColor: 'secondary-text-color'
    });

    expect(mocks.wrapMessageForReply).toHaveBeenCalledWith(
      expect.objectContaining({message: draftMessage})
    );
    expect(parts[0].querySelector('.danger')?.textContent)
    .toBe('Draft: ');
    expect(parts.map((part) => part.textContent).join(''))
    .toBe('Draft: draft body');
  });

  it('prepends an aggregate peer through the shared subtitle renderer', async() => {
    const peerTitleRenderer = vi.fn(async() => {
      const title = document.createElement('span');
      title.textContent = 'Child chat';
      return title;
    });
    const message = {
      _: 'messageService',
      pFlags: {},
      peerId: (-1) as PeerId,
      fromId: (-1) as PeerId,
      mid: 1,
      date: 1,
      action: {_: 'messageActionChatCreate'}
    } as any;

    const parts = await renderDialogSubtitleParts({
      peerId: message.peerId,
      isSaved: false,
      lastMessage: message,
      prependPeerId: (-2) as PeerId,
      middleware: (value) => value,
      peerTitleRenderer,
      textColor: 'secondary-text-color'
    });

    expect(peerTitleRenderer).toHaveBeenCalledWith({
      peerId: (-2) as PeerId,
      dialog: true
    });
    expect(parts.map((part) => part.textContent).join(''))
    .toBe('Child chat: service preview');
  });
});
