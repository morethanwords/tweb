/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import deferredPromise from '../../../helpers/cancellablePromise';
import {formatFullSentTime} from '../../../helpers/date';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import createContextMenu from '../../../helpers/dom/createContextMenu';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import tsNow from '../../../helpers/tsNow';
import {ChatInviteImporter, ExportedChatInvite, MessagesExportedChatInvite, MessagesExportedChatInvites} from '../../../layer';
import appDialogsManager, {DialogElement} from '../../../lib/appManagers/appDialogsManager';
import appImManager from '../../../lib/appManagers/appImManager';
import {AppManagers} from '../../../lib/appManagers/managers';
import {i18n} from '../../../lib/langPack';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import AppSelectPeers from '../../appSelectPeers';
import Row from '../../row';
import SettingSection from '../../settingSection';
import {SliderSuperTabEventable} from '../../sliderTab';
import AppChatInviteLinksTab, {ChatInviteLink} from './chatInviteLinks';

type ChatInvite = ExportedChatInvite.chatInviteExported;

export function getImportersLoader({
  chatId,
  managers,
  link,
  requested
}: {
  chatId: ChatId,
  managers: AppManagers,
  link?: string,
  requested?: boolean
}) {
  const importers: ChatInviteImporter[] = [];
  const importersMap: Map<PeerId, ChatInviteImporter> = new Map();
  let lastQuery = '';
  const load: AppSelectPeers['getMoreCustom'] = async(q) => {
    if(lastQuery !== q) {
      importers.length = 0;
      importersMap.clear();
      lastQuery = q;
    }

    const limit = 50;
    const lastImporter = importers[importers.length - 1];
    const result = await managers.appChatInvitesManager.getChatInviteImporters({
      chatId,
      limit,
      link,
      requested,
      offsetDate: lastImporter?.date,
      offsetUserId: lastImporter?.user_id,
      q
    });

    importers.push(...result.importers);

    return {
      result: result.importers.map((importer) => {
        const peerId = importer.user_id.toPeerId(false);
        importersMap.set(peerId, importer);
        return peerId;
      }),
      isEnd: result.importers.length < limit
    };
  };

  const deleteImporter = (peerId: PeerId) => {
    importers.splice(importers.findIndex((importer) => importer.user_id.toPeerId(false) === peerId), 1);
    importersMap.delete(peerId);
  };

  return {
    importers,
    importersMap,
    load,
    deleteImporter
  };
}

export default class AppChatInviteLinkTab extends SliderSuperTabEventable {
  public async init(
    chatId: ChatId,
    chatInvite: ChatInvite,
    chatInviteLinksTab: AppChatInviteLinksTab,
    onUpdate?: (chatInvite: ChatInvite) => void
  ) {
    const isBroadcast = await this.managers.appChatsManager.isBroadcast(chatId);
    if(chatInvite.title) {
      this.title.replaceChildren(wrapEmojiText(chatInvite.title));
    } else {
      this.setTitle('InviteLink');
    }

    {
      const isExpiring = chatInvite.expire_date && chatInvite.expire_date > tsNow(true);
      const isUsageLimit = chatInvite.usage_limit && chatInvite.usage_limit <= (chatInvite.usage || 0);
      const section = new SettingSection({
        name: 'InviteLink',
        caption: isUsageLimit ? 'LinkIsExpiredLimitReached' : (isExpiring ? 'InviteLinks.ExpiresCaption' : (chatInvite.expire_date ? 'LinkIsExpired' : undefined)),
        captionArgs: isExpiring ? [formatFullSentTime(chatInvite.expire_date)] : undefined
      });

      const inviteLink = new ChatInviteLink({
        buttons: chatInviteLinksTab.menuButtons,
        listenerSetter: this.listenerSetter,
        url: chatInvite.link,
        actions: chatInviteLinksTab.actions
      });

      inviteLink.setChatInvite(chatInvite);

      section.content.append(inviteLink.container);
      this.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({name: 'LinkCreatedeBy'});

      const div = document.createElement('div');
      div.classList.add('chatlist-container');
      section.content.append(div);

      const list = appDialogsManager.createChatList({new: true});
      div.append(list);

      const peerId = chatInvite.admin_id.toPeerId(false);
      const {dom} = appDialogsManager.addDialogNew({
        peerId,
        container: list,
        rippleEnabled: true,
        avatarSize: 'abitbigger',
        meAsSaved: false
      });

      attachClickEvent(dom.listEl, () => {
        appImManager.setInnerPeer({peerId});
      }, {listenerSetter: this.listenerSetter});

      dom.lastMessageSpan.append(formatFullSentTime(chatInvite.date));
      this.scrollable.append(section.container);
    }

    if(chatInvite.usage_limit && !chatInvite.usage && (!chatInvite.expire_date || chatInvite.expire_date > tsNow(true))) {
      const section = new SettingSection({});
      const row = new Row({
        title: i18n('PeopleCanJoinViaLinkCount', [chatInvite.usage_limit])
      });
      section.content.append(row.container);
      this.scrollable.append(section.container);
    }

    const promises: Promise<any>[] = [];
    if(chatInvite.requested) {
      const section = new SettingSection({
        name: 'JoinRequests',
        nameArgs: [chatInvite.requested]
      });
      // const row = new Row({
      //   titleLangKey: isBroadcast ? 'SubscribeRequests' : 'MemberRequests',
      //   clickable: async() => {
      //     const tab = this.slider.createTab(AppChatRequestsTab);
      //     tab.eventListener.addEventListener('finish', (changed) => {
      //       const newLength = chatInvite.requested - changed;
      //       if(newLength) {
      //         row.subtitle.textContent = '' + newLength;
      //       } else {
      //         section.container.remove();
      //       }
      //     });
      //     await tab.open(chatId, chatInvite.link);
      //     // this.slider.removeTabFromHistory(this);
      //   },
      //   icon: 'adduser',
      //   listenerSetter: this.listenerSetter,
      //   subtitle: '' + chatInvite.requested
      // });
      // section.content.append(row.container);
      const {importersMap, load} = getImportersLoader({
        chatId,
        managers: this.managers,
        link: chatInvite.link,
        requested: true
      });

      const dialogElements: Map<PeerId, DialogElement> = new Map();
      const onResult = async(result: Awaited<ReturnType<typeof load>>) => {
        const loadPromises: Promise<any>[] = [];
        result.result.forEach((peerId) => {
          const dialogElement = appDialogsManager.addDialogNew({
            peerId,
            container: chatlist,
            rippleEnabled: true,
            avatarSize: 'abitbigger',
            append: true,
            loadPromises
          });

          dialogElements.set(peerId, dialogElement);
          dialogElement.dom.lastMessageSpan.append(formatFullSentTime(importersMap.get(peerId).date));
        });

        return Promise.all(loadPromises);
      };

      const chatlist = appDialogsManager.createChatList();
      section.content.append(chatlist);
      this.scrollable.append(section.container);

      let target: HTMLElement;
      const toggleRequest = async(add: boolean) => {
        const peerId = target.dataset.peerId.toPeerId();
        const dialogElement = dialogElements.get(peerId);
        const toggle = dialogElement.toggleDisability(true);
        try {
          await this.managers.appChatsManager.hideChatJoinRequest(chatId, peerId, add);
          target.remove();
          dialogElements.delete(peerId);

          if(add) {
            chatInvite.usage = (chatInvite.usage || 0) + 1;
          }

          if(!--chatInvite.requested) {
            delete chatInvite.requested;
            section.container.remove();
          }

          onUpdate?.(chatInvite);
        } catch(err) {
          toggle();
        }
      };

      createContextMenu({
        buttons: [{
          icon: 'adduser',
          text: isBroadcast ? 'AddToChannel' : 'AddToGroup',
          onClick: () => toggleRequest(true)
        }, {
          icon: 'crossround',
          text: 'Dismiss',
          onClick: () => toggleRequest(false)
        }],
        listenTo: chatlist,
        listenerSetter: this.listenerSetter,
        middleware: this.middlewareHelper.get(),
        findElement: (e) => target = findUpClassName(e.target, 'chatlist-chat')
      });

      promises.push(load().then(onResult));
    }

    if(chatInvite.usage) {
      const {importersMap, load} = getImportersLoader({
        chatId,
        managers: this.managers,
        link: chatInvite.link,
        requested: false
      });

      const deferred = deferredPromise<void>();
      const selector = new AppSelectPeers({
        middleware: this.middlewareHelper.get(),
        appendTo: this.container,
        onSelect: (peerId) => {
          appImManager.setInnerPeer({peerId});
        },
        // onChange: this.onSelectChange,
        peerType: ['custom'],
        getMoreCustom: load,
        getSubtitleForElement: (peerId) => formatFullSentTime(importersMap.get(peerId)?.date),
        sectionNameLangPackKey: i18n('PeopleJoined', [chatInvite.usage]),
        onFirstRender: () => {
          deferred.resolve();
        },
        managers: this.managers,
        noSearch: true,
        multiSelect: false
      });

      this.content.remove();
      selector.scrollable.attachBorderListeners(this.container);
      selector.scrollable.container.prepend(...Array.from(this.scrollable.container.children));

      if(chatInvite.usage_limit) {
        const i = i18n('PeopleJoinedRemaining', [chatInvite.usage_limit - chatInvite.usage]);
        i.classList.add('sidebar-left-section-name-right');
        selector.section.title.append(i);
      }

      promises.push(deferred);
    }

    return Promise.all(promises);
  }
}
