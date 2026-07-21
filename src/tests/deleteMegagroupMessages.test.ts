import {Message, Reaction} from '@layer';

vi.hoisted(() => {
  class IntersectionObserverMock {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
    public takeRecords(): IntersectionObserverEntry[] { return []; }
  }

  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: IntersectionObserverMock
  });
});

vi.mock('@components/popups', () => ({
  default: class PopupElement {},
  addCancelButton: (buttons: unknown) => buttons
}));
vi.mock('@lib/langPack', () => ({
  default: class I18n {
    public static weakMap = new WeakMap();
  },
  i18n: () => document.createElement('span')
}));
vi.mock('@components/section', () => ({default: class Section {}}));
vi.mock('@components/stackedAvatars', () => ({default: class StackedAvatars {}}));
vi.mock('@components/wrappers/peerTitle', () => ({default: vi.fn()}));
vi.mock('@components/avatarNew', () => ({avatarNew: vi.fn()}));
vi.mock('@components/peerTitle', () => ({default: class PeerTitle {}}));
vi.mock('@components/rowTsx', () => ({default: vi.fn()}));
vi.mock('@components/iconTsx', () => ({IconTsx: vi.fn()}));
vi.mock('@components/sidebarRight/tabs/groupPermissions/sharedPermissions', () => ({
  ChatPermissions: class ChatPermissions {}
}));
vi.mock('@helpers/animation', () => ({animate: vi.fn()}));
vi.mock('@components/row', () => ({default: class Row {}}));
vi.mock('@components/checkboxField', () => ({default: class CheckboxField {}}));
vi.mock('@components/icon', () => ({default: () => document.createElement('span')}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));

import PopupDeleteMegagroupMessages from '@components/popups/deleteMegagroupMessages';
import CheckboxFields, {CheckboxFieldsField} from '@components/checkboxFields';
import ListenerSetter from '@helpers/listenerSetter';
import '@helpers/peerIdPolyfill';

const chatPeerId = (100 as ChatId).toPeerId(true);
const selectedPeerId = (200 as UserId).toPeerId(false);
const uncheckedPeerId = (201 as UserId).toPeerId(false);
const metaPeerId = (202 as UserId).toPeerId(false);
const fire: Reaction.reactionEmoji = {_: 'reactionEmoji', emoticon: '🔥'};

const messages = [11, 12].map((mid) => ({
  _: 'message',
  pFlags: {},
  id: mid,
  mid,
  peerId: chatPeerId,
  fromId: selectedPeerId,
  date: 1,
  message: ''
})) as Message.message[];

function field(action: string, peerId: PeerId, checked: boolean) {
  return {
    action,
    peerId,
    checkboxField: {checked}
  };
}

describe('PopupDeleteMegagroupMessages moderation actions', () => {
  it('deletes checked participant reactions, ignores unchecked/meta fields, and still deletes selected messages', async() => {
    const deleteParticipantReactions = vi.fn().mockResolvedValue(undefined);
    const deleteMessages = vi.fn();
    const doFlushHistory = vi.fn().mockResolvedValue(undefined);
    const reportSpamMessages = vi.fn().mockResolvedValue(undefined);
    const kickFromChannel = vi.fn().mockResolvedValue(undefined);
    const editBanned = vi.fn().mockResolvedValue(undefined);
    const onConfirm = vi.fn();
    const popup = {
      fields: [
        field('deleteReactions', selectedPeerId, true),
        field('deleteReactions', uncheckedPeerId, false),
        field('deleteOptions', metaPeerId, true),
        field('delete', uncheckedPeerId, false),
        field('report', uncheckedPeerId, false),
        field('ban', uncheckedPeerId, false)
      ],
      messages,
      restricting: false,
      managers: {
        appReactionsManager: {deleteParticipantReactions},
        appMessagesManager: {deleteMessages, doFlushHistory, reportSpamMessages},
        appChatsManager: {kickFromChannel, editBanned}
      },
      onConfirm
    };

    const result = await (PopupDeleteMegagroupMessages.prototype as any).onConfirmClick.call(popup);

    expect(result).toBe(true);
    expect(deleteParticipantReactions).toHaveBeenCalledOnce();
    expect(deleteParticipantReactions).toHaveBeenCalledWith({
      peerId: chatPeerId,
      participantPeerId: selectedPeerId
    });
    expect(deleteMessages).toHaveBeenCalledOnce();
    expect(deleteMessages).toHaveBeenCalledWith(chatPeerId, [11, 12], true);
    expect(doFlushHistory).not.toHaveBeenCalled();
    expect(reportSpamMessages).not.toHaveBeenCalled();
    expect(kickFromChannel).not.toHaveBeenCalled();
    expect(editBanned).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('deletes only the selected participant reaction in reaction mode', async() => {
    const deleteParticipantReaction = vi.fn().mockResolvedValue(undefined);
    const deleteParticipantReactions = vi.fn().mockResolvedValue(undefined);
    const reportParticipantReaction = vi.fn().mockResolvedValue(undefined);
    const deleteMessages = vi.fn();
    const onConfirm = vi.fn();
    const popup = {
      fields: [
        field('deleteReactions', selectedPeerId, false),
        field('report', selectedPeerId, false)
      ],
      messages: [] as Message.message[],
      reaction: {
        message: messages[0],
        participantPeerId: selectedPeerId,
        knownReaction: fire
      },
      restricting: false,
      managers: {
        appReactionsManager: {
          deleteParticipantReaction,
          deleteParticipantReactions,
          reportParticipantReaction
        },
        appMessagesManager: {
          deleteMessages,
          doFlushHistory: vi.fn(),
          reportSpamMessages: vi.fn()
        },
        appChatsManager: {
          kickFromChannel: vi.fn(),
          editBanned: vi.fn()
        }
      },
      onConfirm
    };

    const result = await (PopupDeleteMegagroupMessages.prototype as any).onConfirmClick.call(popup);

    expect(result).toBe(true);
    expect(deleteParticipantReaction).toHaveBeenCalledOnce();
    expect(deleteParticipantReaction).toHaveBeenCalledWith({
      peerId: chatPeerId,
      mid: messages[0].mid,
      participantPeerId: selectedPeerId,
      knownReaction: fire
    });
    expect(deleteParticipantReactions).not.toHaveBeenCalled();
    expect(reportParticipantReaction).not.toHaveBeenCalled();
    expect(deleteMessages).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('deletes all participant reactions without deleting the message in reaction mode', async() => {
    const deleteParticipantReaction = vi.fn().mockResolvedValue(undefined);
    const deleteParticipantReactions = vi.fn().mockResolvedValue(undefined);
    const deleteMessages = vi.fn();
    const onConfirm = vi.fn();
    const popup = {
      fields: [field('deleteReactions', selectedPeerId, true)],
      messages: [] as Message.message[],
      reaction: {
        message: messages[0],
        participantPeerId: selectedPeerId,
        knownReaction: fire
      },
      restricting: false,
      managers: {
        appReactionsManager: {
          deleteParticipantReaction,
          deleteParticipantReactions,
          reportParticipantReaction: vi.fn()
        },
        appMessagesManager: {
          deleteMessages,
          doFlushHistory: vi.fn(),
          reportSpamMessages: vi.fn()
        },
        appChatsManager: {
          kickFromChannel: vi.fn(),
          editBanned: vi.fn()
        }
      },
      onConfirm
    };

    const result = await (PopupDeleteMegagroupMessages.prototype as any).onConfirmClick.call(popup);

    expect(result).toBe(true);
    expect(deleteParticipantReactions).toHaveBeenCalledOnce();
    expect(deleteParticipantReactions).toHaveBeenCalledWith({
      peerId: chatPeerId,
      participantPeerId: selectedPeerId,
      originMid: messages[0].mid,
      knownReaction: fire
    });
    expect(deleteParticipantReaction).not.toHaveBeenCalled();
    expect(deleteMessages).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('reports the participant reaction through appReactionsManager', async() => {
    const deleteParticipantReaction = vi.fn().mockResolvedValue(undefined);
    const reportParticipantReaction = vi.fn().mockResolvedValue(undefined);
    const reportSpamMessages = vi.fn();
    const popup = {
      fields: [field('report', selectedPeerId, true)],
      messages: [] as Message.message[],
      reaction: {
        message: messages[0],
        participantPeerId: selectedPeerId,
        knownReaction: fire
      },
      reportReaction: true,
      restricting: false,
      managers: {
        appReactionsManager: {
          deleteParticipantReaction,
          deleteParticipantReactions: vi.fn(),
          reportParticipantReaction
        },
        appMessagesManager: {
          deleteMessages: vi.fn(),
          doFlushHistory: vi.fn(),
          reportSpamMessages
        },
        appChatsManager: {
          kickFromChannel: vi.fn(),
          editBanned: vi.fn()
        }
      }
    };

    await (PopupDeleteMegagroupMessages.prototype as any).onConfirmClick.call(popup);

    expect(reportParticipantReaction).toHaveBeenCalledOnce();
    expect(reportParticipantReaction).toHaveBeenCalledWith({
      peerId: chatPeerId,
      mid: messages[0].mid,
      participantPeerId: selectedPeerId
    });
    expect(reportSpamMessages).not.toHaveBeenCalled();
    expect(deleteParticipantReaction).toHaveBeenCalledOnce();
  });

  it('falls back to spam reporting when reaction reporting is unavailable', async() => {
    const deleteParticipantReaction = vi.fn().mockResolvedValue(undefined);
    const reportParticipantReaction = vi.fn().mockResolvedValue(undefined);
    const reportSpamMessages = vi.fn().mockResolvedValue(undefined);
    const popup = {
      fields: [field('report', selectedPeerId, true)],
      messages: [] as Message.message[],
      reaction: {
        message: messages[0],
        participantPeerId: selectedPeerId,
        knownReaction: fire
      },
      reportReaction: false,
      restricting: false,
      managers: {
        appReactionsManager: {
          deleteParticipantReaction,
          deleteParticipantReactions: vi.fn(),
          reportParticipantReaction
        },
        appMessagesManager: {
          deleteMessages: vi.fn(),
          doFlushHistory: vi.fn(),
          reportSpamMessages
        },
        appChatsManager: {
          kickFromChannel: vi.fn(),
          editBanned: vi.fn()
        }
      }
    };

    await (PopupDeleteMegagroupMessages.prototype as any).onConfirmClick.call(popup);

    expect(reportSpamMessages).toHaveBeenCalledOnce();
    expect(reportSpamMessages).toHaveBeenCalledWith(chatPeerId, selectedPeerId, [messages[0].mid]);
    expect(reportParticipantReaction).not.toHaveBeenCalled();
    expect(deleteParticipantReaction).toHaveBeenCalledOnce();
  });

  it('keeps only reaction-wide moderation available in a basic group', async() => {
    const getChat = vi.fn().mockResolvedValue({_: 'chat'});
    const hasRights = vi.fn((_chatId: ChatId, right: string) => right === 'delete_messages');
    const isPublic = vi.fn().mockResolvedValue(false);
    const getParticipant = vi.fn();
    const popup = {
      reaction: {
        message: messages[0],
        participantPeerId: selectedPeerId,
        knownReaction: fire
      },
      managers: {
        appChatsManager: {
          getChat,
          hasRights,
          isPublic
        },
        appProfileManager: {getParticipant}
      }
    };

    const options = await (PopupDeleteMegagroupMessages.prototype as any).getModerateOptions.call(
      popup,
      chatPeerId
    );

    expect(options).toEqual({
      reportSpam: false,
      reportReaction: false,
      deleteAllMessages: false,
      deleteAllReactions: true,
      banOrRestrict: false
    });
    expect(getChat).toHaveBeenCalledWith(chatPeerId.toChatId());
    expect(hasRights).toHaveBeenCalledWith(chatPeerId.toChatId(), 'delete_messages');
    expect(hasRights).toHaveBeenCalledWith(chatPeerId.toChatId(), 'ban_users');
    expect(isPublic).toHaveBeenCalledWith(chatPeerId.toChatId());
    expect(getParticipant).not.toHaveBeenCalled();
  });

  it('keeps only singular deletion for a reaction sent as the group itself', async() => {
    const popup = {
      reaction: {
        message: messages[0],
        participantPeerId: chatPeerId,
        knownReaction: fire
      },
      managers: {}
    };

    const options = await (PopupDeleteMegagroupMessages.prototype as any).getModerateOptions.call(
      popup,
      chatPeerId
    );

    expect(options).toEqual({
      reportSpam: false,
      reportReaction: false,
      deleteAllMessages: false,
      deleteAllReactions: false,
      banOrRestrict: false
    });
  });

  it('keeps only singular deletion for the linked discussion channel', async() => {
    const linkedChannelPeerId = (300 as ChatId).toPeerId(true);
    const getChatFull = vi.fn().mockResolvedValue({
      _: 'channelFull',
      linked_chat_id: chatPeerId.toChatId()
    });
    const getChat = vi.fn();
    const hasRights = vi.fn();
    const isPublic = vi.fn();
    const popup = {
      reaction: {
        message: messages[0],
        participantPeerId: linkedChannelPeerId,
        knownReaction: fire
      },
      managers: {
        appChatsManager: {
          getChat,
          hasRights,
          isPublic
        },
        appProfileManager: {getChatFull}
      }
    };

    const options = await (PopupDeleteMegagroupMessages.prototype as any).getModerateOptions.call(
      popup,
      chatPeerId
    );

    expect(options).toEqual({
      reportSpam: false,
      reportReaction: false,
      deleteAllMessages: false,
      deleteAllReactions: false,
      banOrRestrict: false
    });
    expect(getChatFull).toHaveBeenCalledWith(linkedChannelPeerId.toChatId());
    expect(getChat).not.toHaveBeenCalled();
    expect(hasRights).not.toHaveBeenCalled();
    expect(isPublic).not.toHaveBeenCalled();
  });

  it('uses reaction reporting and all moderation actions in a public megagroup owned by the moderator', async() => {
    const getParticipant = vi.fn();
    const popup = {
      reaction: {
        message: messages[0],
        participantPeerId: selectedPeerId,
        knownReaction: fire
      },
      managers: {
        appChatsManager: {
          getChat: vi.fn().mockResolvedValue({
            _: 'channel',
            pFlags: {creator: true, megagroup: true}
          }),
          hasRights: vi.fn().mockResolvedValue(true),
          isPublic: vi.fn().mockResolvedValue(true)
        },
        appProfileManager: {getParticipant}
      }
    };

    const options = await (PopupDeleteMegagroupMessages.prototype as any).getModerateOptions.call(
      popup,
      chatPeerId
    );

    expect(options).toEqual({
      reportSpam: true,
      reportReaction: true,
      deleteAllMessages: true,
      deleteAllReactions: true,
      banOrRestrict: true
    });
    expect(getParticipant).not.toHaveBeenCalled();
  });
});

describe('CheckboxFields custom nested counter', () => {
  it('delegates both derived and explicit counts to the field formatter', () => {
    const nestedCounter = document.createElement('b');
    const setNestedCounter = vi.fn((count: number) => {
      nestedCounter.textContent = `${count}/2`;
    });
    const info = {
      nested: [
        {checkboxField: {checked: true}},
        {checkboxField: {checked: false}}
      ],
      nestedCounter,
      setNestedCounter
    } as unknown as CheckboxFieldsField;
    const checkboxFields = new CheckboxFields({
      fields: [],
      listenerSetter: new ListenerSetter(),
      round: true
    });

    checkboxFields.setNestedCounter(info);
    expect(setNestedCounter).toHaveBeenLastCalledWith(1);
    expect(nestedCounter.textContent).toBe('1/2');

    checkboxFields.setNestedCounter(info, 2);
    expect(setNestedCounter).toHaveBeenLastCalledWith(2);
    expect(nestedCounter.textContent).toBe('2/2');
  });
});
