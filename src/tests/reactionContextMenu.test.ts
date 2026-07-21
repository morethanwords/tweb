import {Message, MessagePeerReaction, Reaction} from '@layer';
import ListenerSetter from '@helpers/listenerSetter';
import '@helpers/peerIdPolyfill';

const {createPopupMock, PopupDeleteMegagroupMessagesMock} = vi.hoisted(() => ({
  createPopupMock: vi.fn(),
  PopupDeleteMegagroupMessagesMock: class PopupDeleteMegagroupMessagesMock {}
}));
const rootScopeMock = vi.hoisted(() => ({myId: 0 as PeerId}));

vi.mock('@components/buttonMenu', () => {
  const render = ({buttons}: {buttons: any[]}) => {
    const menu = document.createElement('div');
    buttons.forEach((button) => {
      const element = button.element ?? document.createElement('button');
      button.element = element;
      if(button.className) {
        element.className = button.className;
      }
      if(button.textElement) {
        element.append(button.textElement);
      }
      menu.append(element);
    });
    return menu;
  };

  return {
    default: async(options: {buttons: any[]}) => render(options),
    ButtonMenuSync: render
  };
});

vi.mock('@components/buttonIcon', () => ({
  default: () => document.createElement('button')
}));

vi.mock('@components/peerTitle', () => ({
  default: class PeerTitle {
    public element = document.createElement('span');

    constructor({peerId}: {peerId: PeerId}) {
      this.element.dataset.peerId = String(peerId);
    }
  }
}));

vi.mock('@components/popups', () => ({
  default: class PopupElement {
    public static createPopup = createPopupMock;
  }
}));

vi.mock('@components/popups/deleteMegagroupMessages', () => ({
  default: PopupDeleteMegagroupMessagesMock
}));

vi.mock('@components/popups/reactedList', () => ({
  default: class PopupReactedList {}
}));

vi.mock('@components/chat/reactions', () => ({default: class ReactionsElement {}}));
vi.mock('@components/chat/reaction', () => ({default: class ReactionElement {}}));
vi.mock('@helpers/date', () => ({formatFullSentTime: (date: number) => String(date)}));
vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => {
    const element = document.createElement('span');
    element.textContent = key;
    return element;
  }
}));
vi.mock('@lib/richTextProcessor/wrapEmojiText', () => ({default: (value: string) => value}));
vi.mock('@components/popups/stickers', () => ({default: vi.fn()}));
vi.mock('@helpers/dom/clickEvent', () => ({
  attachClickEvent: (element: HTMLElement, callback: EventListener) => {
    element.addEventListener('click', callback);
  }
}));
vi.mock('@helpers/dom/attachContextMenuListener', () => ({
  attachContextMenuListener: vi.fn()
}));
vi.mock('@helpers/contextMenuController', () => ({
  default: {close: vi.fn()}
}));
vi.mock('@environment/touchSupport', () => ({default: false}));
vi.mock('@lib/rootScope', () => ({default: rootScopeMock}));

import createReactionContextMenu from '@components/chat/reactionContextMenu';
import deleteParticipantReaction from '@components/chat/deleteParticipantReaction';
import PopupDeleteMegagroupMessages from '@components/popups/deleteMegagroupMessages';

const fire: Reaction.reactionEmoji = {_: 'reactionEmoji', emoticon: '🔥'};
const chatPeerId = (100 as ChatId).toPeerId(true);
const selfPeerId = (200 as UserId).toPeerId(false);
const otherPeerId = (201 as UserId).toPeerId(false);

function peerReaction(userId: UserId, my = false): MessagePeerReaction {
  return {
    _: 'messagePeerReaction',
    pFlags: my ? {my: true} : {},
    peer_id: {_: 'peerUser', user_id: userId},
    date: Number(userId),
    reaction: fire
  };
}

function createMessage(recentReactions: MessagePeerReaction[]) {
  return {
    _: 'message',
    pFlags: {},
    id: 10,
    mid: 10,
    peerId: chatPeerId,
    date: 1,
    message: '',
    reactions: {
      _: 'messageReactions',
      pFlags: {can_see_list: true},
      results: [{_: 'reactionCount', reaction: fire, count: recentReactions.length}],
      recent_reactions: recentReactions
    }
  } as Message.message;
}

function createMenuHarness(message: Message.message, getMessageReactionsList: ReturnType<typeof vi.fn>) {
  const reactionElement = document.createElement('reaction-element') as any;
  reactionElement.reactionCount = {reaction: fire, count: 1};
  document.body.append(reactionElement);

  const canDeleteParticipantReactions = vi.fn().mockResolvedValue(true);

  return {
    reactionElement,
    canDeleteParticipantReactions,
    args: {
      chat: {
        input: {},
        appImManager: {
          setInnerPeer: vi.fn(),
          getStackFromElement: vi.fn()
        }
      } as any,
      managers: {
        appMessagesManager: {
          getMessageByPeer: vi.fn().mockResolvedValue(message)
        },
        appReactionsManager: {
          getMessageReactionsList,
          canDeleteParticipantReactions
        }
      } as any,
      reactionElement,
      reactionsElement: {
        getContext: () => ({peerId: message.peerId, mid: message.mid, reactions: message.reactions})
      } as any,
      middleware: (() => true) as any,
      listenerSetter: new ListenerSetter()
    }
  };
}

describe('reaction context menu fallback', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    rootScopeMock.myId = (999 as UserId).toPeerId(false);
    vi.clearAllMocks();
  });

  it('uses compact recent reactions only when the full-list RPC rejects', async() => {
    const message = createMessage([
      peerReaction(selfPeerId.toUserId(), true),
      peerReaction(otherPeerId.toUserId())
    ]);
    const getMessageReactionsList = vi.fn().mockRejectedValue(new Error('offline'));
    const {args} = createMenuHarness(message, getMessageReactionsList);

    const result = await createReactionContextMenu(args);

    expect(getMessageReactionsList).toHaveBeenCalledOnce();
    expect(result.element.querySelectorAll('.reaction-context-menu-participant')).toHaveLength(2);
    expect(result.element.querySelectorAll('.reaction-context-menu-delete')).toHaveLength(1);

    const myRow = result.element.querySelector(`[data-peer-id="${selfPeerId}"]`)?.closest('button');
    const otherRow = result.element.querySelector(`[data-peer-id="${otherPeerId}"]`)?.closest('button');
    expect(myRow?.querySelector('.reaction-context-menu-delete')).toBeNull();
    expect(otherRow?.querySelector('.reaction-context-menu-delete')).not.toBeNull();
  });

  it('does not replace a successful empty full-list response with stale compact data', async() => {
    const message = createMessage([peerReaction(otherPeerId.toUserId())]);
    const getMessageReactionsList = vi.fn().mockResolvedValue({
      _: 'messages.messageReactionsList',
      count: 0,
      reactions: [],
      chats: [],
      users: []
    });
    const {args} = createMenuHarness(message, getMessageReactionsList);

    expect(await createReactionContextMenu(args)).toBeUndefined();
  });

  it('does not expose compact participant data when the reaction list is private', async() => {
    const message = createMessage([peerReaction(otherPeerId.toUserId())]);
    message.reactions.pFlags.can_see_list = undefined;
    const getMessageReactionsList = vi.fn();
    const {args, canDeleteParticipantReactions} = createMenuHarness(message, getMessageReactionsList);

    expect(await createReactionContextMenu(args)).toBeUndefined();
    expect(getMessageReactionsList).not.toHaveBeenCalled();
    expect(canDeleteParticipantReactions).not.toHaveBeenCalled();
    expect(document.querySelector('.reaction-context-menu-participant')).toBeNull();
  });
});

describe('deleteParticipantReaction moderation popup launcher', () => {
  beforeEach(() => {
    rootScopeMock.myId = (999 as UserId).toPeerId(false);
    vi.clearAllMocks();
  });

  it('does not open moderation for a pFlags.my reaction', async() => {
    const canDeleteParticipantReactions = vi.fn().mockResolvedValue(true);

    const result = await deleteParticipantReaction({
      message: createMessage([]),
      participantPeerId: otherPeerId,
      knownReaction: fire,
      isMyReaction: true,
      managers: {
        appReactionsManager: {
          canDeleteParticipantReactions
        }
      } as any
    });

    expect(result).toBeUndefined();
    expect(canDeleteParticipantReactions).not.toHaveBeenCalled();
    expect(createPopupMock).not.toHaveBeenCalled();
  });

  it('opens singular deletion for a reaction sent as the group itself', async() => {
    const canDeleteParticipantReactions = vi.fn().mockResolvedValue(true);
    const message = createMessage([]);

    const result = await deleteParticipantReaction({
      message,
      participantPeerId: chatPeerId,
      knownReaction: fire,
      managers: {
        appReactionsManager: {
          canDeleteParticipantReactions
        }
      } as any
    });

    expect(result).toBe(true);
    expect(canDeleteParticipantReactions).toHaveBeenCalledWith(chatPeerId);
    expect(createPopupMock).toHaveBeenCalledWith(PopupDeleteMegagroupMessages, {
      reaction: {
        message,
        participantPeerId: chatPeerId,
        knownReaction: fire
      },
      onConfirm: undefined
    });
  });

  it('opens PopupDeleteMegagroupMessages with the selected reaction', async() => {
    const canDeleteParticipantReactions = vi.fn().mockResolvedValue(true);
    const message = createMessage([]);
    const onConfirm = vi.fn();

    const result = await deleteParticipantReaction({
      message,
      participantPeerId: otherPeerId,
      knownReaction: fire,
      managers: {
        appReactionsManager: {
          canDeleteParticipantReactions
        }
      } as any,
      onConfirm
    });

    expect(result).toBe(true);
    expect(canDeleteParticipantReactions).toHaveBeenCalledOnce();
    expect(canDeleteParticipantReactions).toHaveBeenCalledWith(chatPeerId);
    expect(createPopupMock).toHaveBeenCalledOnce();
    expect(createPopupMock).toHaveBeenCalledWith(PopupDeleteMegagroupMessages, {
      reaction: {
        message,
        participantPeerId: otherPeerId,
        knownReaction: fire
      },
      onConfirm
    });
  });
});
