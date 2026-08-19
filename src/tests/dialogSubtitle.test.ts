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

import type {PeerTitleOptions} from '@components/peerTitle';
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
    // * the chat name is pointed at the message with an arrow, not a colon, and
    // * the arrow is a part of its own, between the name and what follows
    expect(parts[1].querySelector<HTMLElement>('[data-icon]')?.dataset.icon)
    .toBe('next');
    expect(parts.map((part) => part.textContent).join(''))
    .toBe('Child chatservice preview');
  });

  it('opens with the sender, points at the chat, then the message', async() => {
    const peerTitleRenderer = vi.fn(async({peerId}: PeerTitleOptions) => {
      const title = document.createElement('span');
      title.textContent = peerId === (-2 as PeerId) ? 'Child chat' : 'Sender';
      return title;
    });
    const message = {
      _: 'message',
      pFlags: {},
      peerId: (-1) as PeerId,
      fromId: (-3) as PeerId,
      fwdFromId: (-4) as PeerId,
      mid: 1,
      date: 1,
      message: 'body'
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

    // * sender, arrow, chat name, forward icon, message — the arrow between the
    // * two names, the colon handing the line over to the message
    expect(parts.map((part) => part.textContent))
    .toEqual(['Sender', '', 'Child chat: ', '', 'body']);
    expect(parts[1].querySelector<HTMLElement>('[data-icon]')?.dataset.icon)
    .toBe('next');
    expect(parts.every((part) => part.dir === 'auto')).toBe(true);
    expect(parts.map((part) => part.classList.contains(
      'dialog-subtitle-span-last'
    ))).toEqual([false, false, false, false, true]);
  });

  it('keeps the colon on a sender with no chat name in front', async() => {
    const peerTitleRenderer = vi.fn(async() => {
      const title = document.createElement('span');
      title.textContent = 'Sender';
      return title;
    });
    const message = {
      _: 'message',
      pFlags: {},
      peerId: (-1) as PeerId,
      fromId: (-3) as PeerId,
      mid: 1,
      date: 1,
      message: 'body'
    } as any;

    const parts = await renderDialogSubtitleParts({
      peerId: message.peerId,
      isSaved: false,
      lastMessage: message,
      middleware: (value) => value,
      peerTitleRenderer,
      textColor: 'secondary-text-color'
    });

    expect(parts.map((part) => part.textContent))
    .toEqual(['Sender: ', 'body']);
  });
});
