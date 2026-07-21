import type Chat from '@components/chat/chat';
import type {MyDocument} from '@appManagers/appDocsManager';
import {InputStickerSet, Message, MessagePeerReaction, MessagesMessageReactionsList, Reaction} from '@layer';
import {AppManagers} from '@lib/managers';
import {Middleware} from '@helpers/middleware';
import ListenerSetter from '@helpers/listenerSetter';
import ButtonMenu, {ButtonMenuItemOptions} from '@components/buttonMenu';
import ButtonIcon from '@components/buttonIcon';
import PeerTitle from '@components/peerTitle';
import PopupElement from '@components/popups';
import PopupReactedList from '@components/popups/reactedList';
import ReactionsElement from '@components/chat/reactions';
import ReactionElement from '@components/chat/reaction';
import {formatFullSentTime} from '@helpers/date';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import reactionsEqual from '@appManagers/utils/reactions/reactionsEqual';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import showStickersPopup from '@components/popups/stickers';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {attachContextMenuListener} from '@helpers/dom/attachContextMenuListener';
import cancelEvent from '@helpers/dom/cancelEvent';
import contextMenuController from '@helpers/contextMenuController';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import deleteParticipantReaction from '@components/chat/deleteParticipantReaction';
import replaceContent from '@helpers/dom/replaceContent';
import rootScope from '@lib/rootScope';

const MAX_VISIBLE_REACTORS = 6;

type ReactionPack = {
  input: InputStickerSet.inputStickerSetID,
  title: string
};

async function getReactionPack(managers: AppManagers, reaction: Reaction): Promise<ReactionPack> {
  if(reaction._ !== 'reactionCustomEmoji') {
    return;
  }

  const [cachedDocument] = await managers.appEmojiManager.getCachedCustomEmojiDocuments([reaction.document_id]);
  const document = cachedDocument ?? (await managers.appEmojiManager.getCustomEmojiDocuments([reaction.document_id]))[0];
  const input = (document as MyDocument)?.stickerSetInput as InputStickerSet.inputStickerSetID;
  if(!input || input._ !== 'inputStickerSetID') {
    return;
  }

  const stickerSet = await managers.appStickersManager.getStickerSet(input);
  return {
    input,
    title: stickerSet.set.title
  };
}

function createPeerText(peerId: PeerId, date: number) {
  const container = document.createElement('span');
  container.classList.add('reaction-context-menu-peer');

  const title = new PeerTitle({
    peerId,
    dialog: false
  }).element;
  title.classList.add('reaction-context-menu-peer-title');

  const subtitle = document.createElement('span');
  subtitle.classList.add('reaction-context-menu-peer-date');
  subtitle.append(formatFullSentTime(date, false));

  container.append(title, subtitle);
  return container;
}

export default async function createReactionContextMenu({
  chat,
  managers,
  reactionElement,
  reactionsElement,
  middleware,
  listenerSetter
}: {
  chat: Chat,
  managers: AppManagers,
  reactionElement: ReactionElement,
  reactionsElement: ReactionsElement,
  middleware: Middleware,
  listenerSetter: ListenerSetter
}) {
  const context = reactionsElement.getContext();
  const reaction = reactionElement.reactionCount.reaction;
  const message = await managers.appMessagesManager.getMessageByPeer(context.peerId, context.mid) as Message.message | Message.messageService;
  if(!middleware() || !message) {
    return;
  }

  const canViewList = !!message.reactions?.pFlags.can_see_list || message.peerId.isUser();
  const reactionPackPromise = getReactionPack(managers, reaction).catch((): undefined => undefined);
  const [reactionsList, canDelete]: [
    MessagesMessageReactionsList | undefined,
    boolean
  ] = await Promise.all([
    canViewList ? managers.appReactionsManager.getMessageReactionsList(
      message.peerId,
      message.mid,
      50,
      reaction
    ).catch((): undefined => undefined) : undefined,
    canViewList ? managers.appReactionsManager.canDeleteParticipantReactions(message.peerId) : false
  ]);
  if(!middleware() || !reactionElement.isConnected) {
    return;
  }

  const seenPeerIds = new Set<PeerId>();
  const sourceReactions = reactionsList ?
    reactionsList.reactions :
    (canViewList ? message.reactions?.recent_reactions ?? [] : []);
  const peerReactions = sourceReactions.filter((peerReaction: MessagePeerReaction) => {
    const peerId = getPeerId(peerReaction.peer_id);
    if(
      seenPeerIds.has(peerId) ||
      !reactionsEqual(peerReaction.reaction, reaction)
    ) {
      return false;
    }

    seenPeerIds.add(peerId);
    return true;
  });
  const visiblePeerReactions = peerReactions.slice(0, MAX_VISIBLE_REACTORS);
  const buttons: ButtonMenuItemOptions[] = [];
  const participantButtons: Array<{
    button: ButtonMenuItemOptions,
    peerReaction: MessagePeerReaction,
    peerId: PeerId
  }> = [];

  visiblePeerReactions.forEach((peerReaction) => {
    const peerId = getPeerId(peerReaction.peer_id);
    const button: ButtonMenuItemOptions = {
      avatarInfo: {peerId},
      className: 'reaction-context-menu-participant with-subtitle',
      textElement: createPeerText(peerId, peerReaction.date),
      onClick: undefined
    };
    buttons.push(button);
    participantButtons.push({button, peerReaction, peerId});
  });

  if(reactionsList?.count > visiblePeerReactions.length) {
    buttons.push({
      icon: 'reactions',
      text: 'ShowAllReactions',
      separator: !!buttons.length,
      onClick: () => {
        PopupElement.createPopup(PopupReactedList, message as Message.message, reaction);
      }
    });
  }

  let reactionPackButton: ButtonMenuItemOptions;
  let resolveReactionPackButton = false;
  if(reaction._ === 'reactionCustomEmoji') {
    if(buttons.length) {
      resolveReactionPackButton = true;
      reactionPackButton = {
        text: 'Loading',
        multiline: true,
        separator: true,
        keepOpen: true,
        onClick: () => {
          void reactionPackPromise.then((reactionPack) => {
            if(middleware() && reactionPack) {
              contextMenuController.close();
              showStickersPopup(reactionPack.input, true, chat.input);
            }
          });
        }
      };
    } else {
      const reactionPack = await reactionPackPromise;
      if(!middleware() || !reactionPack) {
        return;
      }

      reactionPackButton = {
        textElement: i18n('MessageContainsReactionPack', [wrapEmojiText(reactionPack.title)]),
        multiline: true,
        onClick: () => {
          showStickersPopup(reactionPack.input, true, chat.input);
        }
      };
    }
    buttons.push(reactionPackButton);
  }

  const hasDeletableParticipant = canDelete && participantButtons.some(({peerReaction, peerId}) =>
    !peerReaction.pFlags.my && peerId !== rootScope.myId
  );
  if(IS_TOUCH_SUPPORTED && hasDeletableParticipant) {
    const hint = document.createElement('div');
    hint.classList.add('reaction-context-menu-hint');
    hint.append(i18n('TapAndHoldToDeleteReaction'));
    buttons.push({
      element: hint,
      separator: document.createElement('hr'),
      onClick: undefined
    });
  }

  if(!buttons.length) {
    return;
  }

  const element = await ButtonMenu({buttons, listenerSetter});
  element.classList.add('contextmenu', 'reaction-context-menu');
  element.setAttribute('role', 'menu');

  if(resolveReactionPackButton) {
    void reactionPackPromise.then((reactionPack) => {
      if(!middleware()) {
        return;
      }

      if(!reactionPack) {
        reactionPackButton.element.remove();
        (reactionPackButton.separator as HTMLElement).remove();
        return;
      }

      replaceContent(
        reactionPackButton.textElement,
        i18n('MessageContainsReactionPack', [wrapEmojiText(reactionPack.title)])
      );
    });
  }

  participantButtons.forEach(({button, peerReaction, peerId}) => {
    const openPeer = (e: Event) => {
      cancelEvent(e);
      contextMenuController.close();
      chat.appImManager.setInnerPeer({
        peerId,
        stack: chat.appImManager.getStackFromElement(reactionElement)
      });
    };
    listenerSetter.add(button.element)('click', openPeer);
    button.element.tabIndex = 0;
    button.element.setAttribute('role', 'menuitem');
    listenerSetter.add(button.element)('keydown', (e: KeyboardEvent) => {
      if(e.target === button.element && (e.key === 'Enter' || e.key === ' ')) {
        openPeer(e);
      }
    });

    const isMyReaction = !!peerReaction.pFlags.my;
    if(!canDelete || isMyReaction || peerId === rootScope.myId) {
      return;
    }

    const onDelete = (e: Event) => {
      cancelEvent(e);
      void deleteParticipantReaction({
        message,
        participantPeerId: peerId,
        knownReaction: peerReaction.reaction,
        isMyReaction,
        managers
      });

      // Keep the current menu alive until attachContextMenuListener installs
      // its touchend guard, then close it behind the confirmation popup.
      setTimeout(() => contextMenuController.close(), 0);
    };
    attachContextMenuListener({
      element: button.element,
      callback: onDelete,
      listenerSetter
    });

    if(!IS_TOUCH_SUPPORTED) {
      const deleteButton = ButtonIcon('close', {noRipple: true});
      deleteButton.classList.add('reaction-context-menu-delete');
      deleteButton.setAttribute('aria-label', i18n('DeleteReaction').textContent);
      attachClickEvent(deleteButton, onDelete, {listenerSetter});
      button.element.append(deleteButton);
    }
  });

  return {
    element,
    destroy: () => {
      buttons.forEach((button) => button.dispose?.());
      element.remove();
    }
  };
}
