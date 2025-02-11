/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import {Message, Reaction, ReactionCount} from '../../layer';
import ReactionsElement from '../chat/reactions';
import {horizontalMenu} from '../horizontalMenu';
import Scrollable from '../scrollable';
import ScrollableLoader from '../../helpers/scrollableLoader';
import appDialogsManager, {DialogDom, DialogElement} from '../../lib/appManagers/appDialogsManager';
import replaceContent from '../../helpers/dom/replaceContent';
import wrapSticker from '../wrappers/sticker';
import ReactionElement, {ReactionLayoutType} from '../chat/reaction';
import getUserStatusString from '../wrappers/getUserStatusString';
import {MediaSize, makeMediaSize} from '../../helpers/mediaSize';
import wrapCustomEmoji from '../wrappers/customEmoji';
import SettingSection from '../settingSection';
import {formatFullSentTime} from '../../helpers/date';
import {Middleware} from '../../helpers/middleware';
import rootScope from '../../lib/rootScope';
import Icon from '../icon';

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
  } else {
    const user = await rootScope.managers.appUsersManager.getUser(peerId.toUserId());
    replaceContent(dom.lastMessageSpan, getUserStatusString(user));
  }
}

export default class PopupReactedList extends PopupElement {
  constructor(
    private message: Message.message
  ) {
    super('popup-reacted-list', {closable: true, overlayClosable: true, body: true});

    this.init();
  }

  private async init() {
    const middleware = this.middlewareHelper.get();
    const message = await this.managers.appMessagesManager.getGroupsFirstMessage(this.message);
    if(!middleware()) return;
    const canViewReadParticipants = await this.managers.appMessagesManager.canViewMessageReadParticipants(message);
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
      middleware: this.middlewareHelper.get()
    });
    reactionsElement.render();
    reactionsElement.classList.add('no-stripe');
    reactionsElement.classList.remove('has-no-reactions');

    reactionsElement.append(this.btnClose);

    this.header.append(reactionsElement);

    const tabsContainer = document.createElement('div');
    tabsContainer.classList.add('tabs-container');
    tabsContainer.dataset.animation = 'tabs';

    const loaders: Map<HTMLElement, ScrollableLoader> = new Map();

    let hasAllReactions = false;
    if(newMessage.reactions.results.length) {
      const reaction = this.createFakeReaction('reactions', newMessage.reactions.results.reduce((acc, r) => acc + r.count, 0));

      reactionsElement.prepend(reaction);
      newMessage.reactions.results.unshift(reaction.reactionCount);
      hasAllReactions = true;
    }

    let hasReadParticipants = false;
    if(canViewReadParticipants) {
      try {
        const readUserIds = await this.managers.appMessagesManager.getMessageReadParticipants(message.peerId, message.mid);
        if(!middleware()) return;
        if(!readUserIds.length) {
          throw '';
        }

        const reaction = this.createFakeReaction('checks', readUserIds.length);

        reactionsElement.prepend(reaction);
        newMessage.reactions.results.unshift(reaction.reactionCount);
        hasReadParticipants = true;
      } catch(err) {

      }
    }

    if(reactionsElement.customEmojiRenderer) {
      reactionsElement.append(reactionsElement.customEmojiRenderer);
    }

    newMessage.reactions.results.forEach((reactionCount) => {
      const scrollable = new Scrollable(undefined);
      scrollable.container.classList.add('tabs-tab');

      const section = new SettingSection({
        noShadow: true,
        noDelimiter: true
      });

      const chatlist = appDialogsManager.createChatList({
        dialogSize: 72
      });

      appDialogsManager.setListClickListener({
        list: chatlist,
        onFound: () => {
          this.hide();
        },
        withContext: undefined,
        autonomous: false,
        openInner: true
      });

      section.content.append(chatlist);
      scrollable.append(section.container);

      const skipReadParticipants = (reactionCount.reaction as any) !== 'checks';
      const skipReactionsList = (reactionCount.reaction as any) === 'checks';
      if(['checks', 'reactions'].includes(reactionCount.reaction as any)) {
        reactionCount.reaction = undefined;
      }

      let nextOffset: string;
      const loader = new ScrollableLoader({
        scrollable,
        getPromise: async() => {
          const result = await this.managers.appMessagesManager.getMessageReactionsListAndReadParticipants(message, undefined, reactionCount.reaction, nextOffset, skipReadParticipants, skipReactionsList);
          nextOffset = result.nextOffset;

          await Promise.all(result.combined.map(async({peerId, reaction, date}) => {
            const dialogElement = appDialogsManager.addDialogNew({
              peerId: peerId,
              autonomous: true,
              container: chatlist,
              avatarSize: 'abitbigger',
              rippleEnabled: false,
              meAsSaved: false,
              wrapOptions: {
                middleware: this.middlewareHelper.get()
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
          }));

          return !nextOffset;
        }
      });

      loaders.set(scrollable.container, loader);

      tabsContainer.append(scrollable.container);
    });

    this.body.append(tabsContainer);

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
    }, undefined, undefined, undefined, this.listenerSetter);

    // selectTab(hasAllReactions && hasReadParticipants ? 1 : 0, false);
    selectTab(0, false);

    this.show();
  }

  private createFakeReaction(icon: Icon, count: number) {
    const reaction = new ReactionElement();
    reaction.init(ReactionLayoutType.Block, this.middlewareHelper.get());
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
}
