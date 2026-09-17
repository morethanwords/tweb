import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {Message, Reaction, ReactionCount} from '@layer';
import ReactionsElement from '@components/chat/reactions';
import {horizontalMenu} from '@components/horizontalMenu';
import Scrollable from '@components/scrollable';
import ScrollableLoader from '@helpers/scrollableLoader';
import appDialogsManager, {DialogDom, DialogElement} from '@lib/appDialogsManager';
import replaceContent from '@helpers/dom/replaceContent';
import wrapSticker from '@components/wrappers/sticker';
import ReactionElement, {ReactionLayoutType} from '@components/chat/reaction';
import getUserStatusString from '@components/wrappers/getUserStatusString';
import {MediaSize, makeMediaSize} from '@helpers/mediaSize';
import wrapCustomEmoji from '@components/wrappers/customEmoji';
import {formatFullSentTime} from '@helpers/date';
import {Middleware} from '@helpers/middleware';
import rootScope from '@lib/rootScope';
import Icon from '@components/icon';
import reactionsEqual from '@appManagers/utils/reactions/reactionsEqual';
import {ButtonMenuSync} from '@components/buttonMenu';
import ListenerSetter from '@helpers/listenerSetter';
import {attachContextMenuListener} from '@helpers/dom/attachContextMenuListener';
import cancelEvent from '@helpers/dom/cancelEvent';
import contextMenuController from '@helpers/contextMenuController';
import positionMenu from '@helpers/positionMenu';
import {getOverlayRoot} from '@helpers/appWindow';
import deleteParticipantReaction from '@components/chat/deleteParticipantReaction';

const size = 24;
const _mediaSize = makeMediaSize(size, size);
export async function processDialogElementForReaction({
  peerId,
  dialogElement,
  reaction,
  middleware,
  isMine,
  date,
  mediaSize = _mediaSize
}: {
  peerId: PeerId,
  dialogElement: DialogElement,
  reaction?: Reaction,
  middleware: Middleware,
  isMine: boolean,
  date: number,
  mediaSize?: MediaSize
}) {
  const {dom} = dialogElement;
  if(reaction) {
    const stickerContainer = document.createElement('div');
    stickerContainer.classList.add('reacted-list-reaction-icon');

    if(reaction._ === 'reactionEmoji') {
      const availableReaction = await rootScope.managers.appReactionsManager.getReaction(reaction.emoticon);

      wrapSticker({
        doc: availableReaction.static_icon,
        div: stickerContainer,
        width: 24,
        height: 24,
        middleware
      });
    } else if(reaction._ === 'reactionCustomEmoji') {
      stickerContainer.append(wrapCustomEmoji({
        docIds: [reaction.document_id],
        customEmojiSize: mediaSize,
        middleware
      }));
    }

    dom.listEl.append(stickerContainer);
  }

  if(date && isMine) {
    const c = document.createElement('span');
    dom.lastMessageSpan.style.cssText = `display: flex !important; align-items: center;`;
    const span = Icon(reaction ? 'reactions' : 'checks', 'reacted-list-checks');
    const fragment = document.createDocumentFragment();
    c.append(formatFullSentTime(date, false));
    fragment.append(span, c);
    replaceContent(dom.lastMessageSpan, fragment);
  } else if(peerId.isUser()) {
    const user = await rootScope.managers.appUsersManager.getUser(peerId.toUserId());
    replaceContent(dom.lastMessageSpan, getUserStatusString(user));
  } else if(date) {
    replaceContent(dom.lastMessageSpan, formatFullSentTime(date, false));
  }
}

import {createSignal, onCleanup, onMount} from 'solid-js';
import {getMiddleware} from '@helpers/middleware';

export default async function showReactedListPopup(message$: Message.message, initialReaction?: Reaction) {
  const middlewareHelper = getMiddleware();
  const middleware = middlewareHelper.get();
  const listenerSetter = new ListenerSetter();
  const [show, setShow] = createSignal(false);

  function openDeleteReactionMenu({
  e,
  element,
  message,
  participantPeerId,
  reaction,
  isMyReaction
  }: {
  e: MouseEvent | TouchEvent,
  element: HTMLElement,
  message: Message.message,
  participantPeerId: PeerId,
  reaction: Reaction,
  isMyReaction?: boolean
  }) {
  cancelEvent(e);

  const listenerSetter = new ListenerSetter();
  const menu = ButtonMenuSync({
    buttons: [{
      icon: 'delete',
      text: 'DeleteReaction',
      danger: true,
      onClick: () => {
        void deleteParticipantReaction({
          message,
          participantPeerId,
          knownReaction: reaction,
          isMyReaction,
          managers: rootScope.managers,
          onConfirm: () => {
            setShow(false);
          }
        });
      }
    }],
    listenerSetter
  });
  menu.classList.add('contextmenu');
  getOverlayRoot().append(menu);
  positionMenu(e, menu);
  contextMenuController.openBtnMenu(menu, () => {
    listenerSetter.removeAll();
    setTimeout(() => menu.remove(), 300);
  }, element);
  }

  function createFakeReaction(icon: Icon, count: number) {
  const reaction = new ReactionElement();
  reaction.init(ReactionLayoutType.Block, middleware);
  reaction.reactionCount = {
    _: 'reactionCount',
    count: count,
    reaction: icon as any
  };
  reaction.setCanRenderAvatars(false);
  reaction.renderCounter();

  const allReactionsSticker = document.createElement('div');
  allReactionsSticker.classList.add('reaction-counter', 'reaction-sticker-icon');
  allReactionsSticker.append(Icon(icon));
  reaction.prepend(allReactionsSticker);

  return reaction;
  }

  const message = await rootScope.managers.appMessagesManager.getGroupsFirstMessage(message$);
  if(!middleware()) return;
  const [canViewReadParticipants, canDeleteReactions] = await Promise.all([
    rootScope.managers.appMessagesManager.canViewMessageReadParticipants(message),
    rootScope.managers.appReactionsManager.canDeleteParticipantReactions(message.peerId)
  ]);
  if(!middleware()) return;
  // this.body.append(generateDelimiter());

  const reactionsElement = new ReactionsElement();
  const newMessage: Message.message = {
    ...message,
    mid: 0,
    id: 0,
    reactions: {
      _: 'messageReactions',
      results: [],

      ...message.reactions,

      pFlags: {},
      recent_reactions: []
    }
  };

  newMessage.reactions.results = newMessage.reactions.results.map((reactionCount) => {
    const _reactionCount: ReactionCount = {
      ...reactionCount,
      chosen_order: undefined
    };

    return _reactionCount;
  });

  reactionsElement.init({
    context: newMessage,
    type: ReactionLayoutType.Block,
    middleware: middleware
  });
  reactionsElement.render();
  reactionsElement.classList.add('no-stripe');
  reactionsElement.classList.remove('has-no-reactions');


  const tabsContainer = document.createElement('div');
  tabsContainer.classList.add('tabs-container');
  tabsContainer.dataset.animation = 'tabs';

  const loaders: Map<HTMLElement, ScrollableLoader> = new Map();

  let hasAllReactions = false;
  if(newMessage.reactions.results.length) {
    const reaction = createFakeReaction('reactions', newMessage.reactions.results.reduce((acc, r) => acc + r.count, 0));

    reactionsElement.prepend(reaction);
    newMessage.reactions.results.unshift(reaction.reactionCount);
    hasAllReactions = true;
  }

  let hasReadParticipants = false;
  if(canViewReadParticipants) {
    try {
      const readUserIds = await rootScope.managers.appMessagesManager.getMessageReadParticipants(message.peerId, message.mid);
      if(!middleware()) return;
      if(!readUserIds.length) {
        throw '';
      }

      const reaction = createFakeReaction('checks', readUserIds.length);

      reactionsElement.prepend(reaction);
      newMessage.reactions.results.unshift(reaction.reactionCount);
      hasReadParticipants = true;
    } catch(err) {

    }
  }

  if(reactionsElement.customEmojiRenderer) {
    reactionsElement.append(reactionsElement.customEmojiRenderer);
  }

  const initialTabIndex = initialReaction ? newMessage.reactions.results.findIndex((reactionCount) => {
    return reactionsEqual(reactionCount.reaction, initialReaction);
  }) : 0;

  newMessage.reactions.results.forEach((reactionCount) => {
    const scrollable = new Scrollable(undefined);
    scrollable.container.classList.add('tabs-tab');

    const chatlist = appDialogsManager.createChatList({
      dialogSize: 72
    });

    appDialogsManager.setListClickListener({
      list: chatlist,
      onFound: () => {
        setShow(false);
      },
      withContext: undefined,
      autonomous: false,
      openInner: true
    });

    scrollable.append(chatlist);

    const skipReadParticipants = (reactionCount.reaction as any) !== 'checks';
    const skipReactionsList = (reactionCount.reaction as any) === 'checks';
    if(['checks', 'reactions'].includes(reactionCount.reaction as any)) {
      reactionCount.reaction = undefined;
    }

    let nextOffset: string;
    const loader = new ScrollableLoader({
      scrollable,
      getPromise: async() => {
        const result = await rootScope.managers.appMessagesManager.getMessageReactionsListAndReadParticipants(message, undefined, reactionCount.reaction, nextOffset, skipReadParticipants, skipReactionsList);
        nextOffset = result.nextOffset;

        await Promise.all(result.combined.map(async({peerId, reaction, date, isMyReaction}) => {
          const dialogElement = appDialogsManager.addDialogNew({
            peerId: peerId,
            autonomous: true,
            container: chatlist,
            avatarSize: 'abitbigger',
            rippleEnabled: false,
            meAsSaved: false,
            wrapOptions: {
              middleware: middleware
            }
          });

          await processDialogElementForReaction({
            dialogElement,
            date,
            isMine: message.pFlags.out,
            middleware,
            peerId,
            reaction
          });
          if(!middleware()) return;

          if(canDeleteReactions && reaction && !isMyReaction && peerId !== rootScope.myId) {
            attachContextMenuListener({
              element: dialogElement.dom.listEl,
              callback: (e) => openDeleteReactionMenu({
                e,
                element: dialogElement.dom.listEl,
                message,
                participantPeerId: peerId,
                reaction,
                isMyReaction
              }),
              listenerSetter: listenerSetter
            });
          }
        }));

        return !nextOffset;
      }
    });

    loaders.set(scrollable.container, loader);

    tabsContainer.append(scrollable.container);
  });


  const selectTab = horizontalMenu(reactionsElement, tabsContainer, (id, tabContent) => {
    if(id >= (reactionsElement.childElementCount - (reactionsElement.customEmojiRenderer ? 2 : 1))) {
      return false;
    }

    const reaction = reactionsElement.children[id] as ReactionElement;
    const prevId = selectTab.prevId();
    if(prevId !== -1) {
      (reactionsElement.children[prevId] as ReactionElement).setIsChosen(false);
    }

    reaction.setIsChosen(true);

    const loader = loaders.get(tabContent);
    loader.load();
  }, undefined, undefined, undefined, listenerSetter);

  // selectTab(hasAllReactions && hasReadParticipants ? 1 : 0, false);
  selectTab(initialTabIndex === -1 ? 0 : initialTabIndex, false);

  setShow(true);

  createPopup(() => {
    let headerEl!: HTMLDivElement, bodyEl!: HTMLDivElement;

    onMount(() => {
      // the close button rides inside the reactions strip, as it did before
      reactionsElement.append(headerEl.querySelector('.popup-close'));
      headerEl.append(reactionsElement);
      bodyEl.append(tabsContainer);
    });

    onCleanup(() => {
      listenerSetter.removeAll();
      middlewareHelper.destroy();
    });

    return (
      <PopupElement class="popup-reacted-list" closable show={show()}>
        <PopupElement.Header ref={(element) => headerEl = element}>
          <PopupElement.CloseButton />
        </PopupElement.Header>
        <PopupElement.Body ref={(element) => bodyEl = element} />
      </PopupElement>
    );
  });
}
