/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from ".";
import { Message } from "../../layer";
import { SettingSection } from "../sidebarLeft";
import ReactionsElement from "../chat/reactions";
import { horizontalMenu } from "../horizontalMenu";
import Scrollable from "../scrollable";
import ScrollableLoader from "../../helpers/scrollableLoader";
import appDialogsManager from "../../lib/appManagers/appDialogsManager";
import replaceContent from "../../helpers/dom/replaceContent";
import { wrapSticker } from "../wrappers";
import ReactionElement from "../chat/reaction";
import getUserStatusString from "../wrappers/getUserStatusString";

export default class PopupReactedList extends PopupElement {
  constructor(
    private message: Message.message
  ) {
    super('popup-reacted-list', {closable: true, overlayClosable: true, body: true});

    this.init();
  }

  private async init() {
    const message = await this.managers.appMessagesManager.getGroupsFirstMessage(this.message);

    const canViewReadParticipants = await this.managers.appMessagesManager.canViewMessageReadParticipants(message);

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
      return {
        ...reactionCount,
        pFlags: {}
      };
    });

    reactionsElement.init(newMessage, 'block');
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

      appDialogsManager.setListClickListener(chatlist, () => {
        this.hide();
      }, undefined, false, true);

      section.content.append(chatlist);
      scrollable.container.append(section.container);

      const skipReadParticipants = reactionCount.reaction !== 'checks';
      const skipReactionsList = reactionCount.reaction === 'checks';
      if(['checks', 'reactions'].includes(reactionCount.reaction)) {
        reactionCount.reaction = undefined;
      }

      let nextOffset: string;
      const loader = new ScrollableLoader({
        scrollable,
        getPromise: async() => {
          const result = await this.managers.appMessagesManager.getMessageReactionsListAndReadParticipants(message, undefined, reactionCount.reaction, nextOffset, skipReadParticipants, skipReactionsList);
          nextOffset = result.nextOffset;

          await Promise.all(result.combined.map(async({peerId, reaction}) => {
            const {dom} = appDialogsManager.addDialogNew({
              peerId: peerId,
              autonomous: true,
              container: chatlist,
              avatarSize: 54,
              rippleEnabled: false,
              meAsSaved: false,
            });

            if(reaction) {
              const stickerContainer = document.createElement('div');
              stickerContainer.classList.add('reacted-list-reaction-icon');
              const availableReaction = await this.managers.appReactionsManager.getReactionCached(reaction);

              wrapSticker({
                doc: availableReaction.static_icon,
                div: stickerContainer,
                width: 24,
                height: 24
              });
  
              dom.listEl.append(stickerContainer);
            }

            replaceContent(dom.lastMessageSpan, getUserStatusString(await this.managers.appUsersManager.getUser(peerId.toUserId())));
          }));

          return !nextOffset;
        }
      });

      loaders.set(scrollable.container, loader);

      tabsContainer.append(scrollable.container);
    });

    this.body.append(tabsContainer);

    const selectTab = horizontalMenu(reactionsElement, tabsContainer, (id, tabContent) => {
      if(id === (reactionsElement.childElementCount - 1)) {
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

  private createFakeReaction(icon: string, count: number) {
    const reaction = new ReactionElement();
    reaction.init('block');
    reaction.reactionCount = {
      _: 'reactionCount',
      count: count,
      reaction: icon
    };
    reaction.setCanRenderAvatars(false);
    reaction.renderCounter();

    const allReactionsSticker = document.createElement('div');
    allReactionsSticker.classList.add('reaction-counter', 'reaction-sticker-icon', 'tgico-' + icon);
    reaction.prepend(allReactionsSticker);

    return reaction;
  }
}
