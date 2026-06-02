import {Component} from 'solid-js';
import deferredPromise from '@helpers/cancellablePromise';
import {formatFullSentTime} from '@helpers/date';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import createContextMenu from '@helpers/dom/createContextMenu';
import findUpClassName from '@helpers/dom/findUpClassName';
import tsNow from '@helpers/tsNow';
import appDialogsManager, {DialogElement} from '@lib/appDialogsManager';
import appImManager from '@lib/appImManager';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import AppSelectPeers from '@components/appSelectPeers';
import {StarsAmount} from '@components/popups/stars';
import Row from '@components/row';
import SettingSection from '@components/settingSection';
import {UsernameRow} from '@components/usernamesSection';
import {ChatInviteLink, getImportersLoader} from './chatInviteLinkShared';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppChatInviteLinkTab} from '@components/solidJsTabs/tabs';

const ChatInviteLinkTab: Component = () => {
  const [tab] = useSuperTab<typeof AppChatInviteLinkTab>();
  const promiseCollector = usePromiseCollector();
  const {chatId, chatInvite, menuButtons, actions, onUpdate} = tab.payload;

  promiseCollector.collect((async() => {
    const isBroadcast = await tab.managers.appChatsManager.isBroadcast(chatId);
    // default title 'InviteLink' is set by the scaffold; override only for a custom invite title
    if(chatInvite.title) {
      tab.title.replaceChildren(wrapEmojiText(chatInvite.title));
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
        buttons: menuButtons,
        listenerSetter: tab.listenerSetter,
        url: chatInvite.link,
        actions
      });

      inviteLink.setChatInvite(chatInvite);

      section.content.append(inviteLink.container);
      tab.scrollable.append(section.container);
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
        meAsSaved: false,
        wrapOptions: {
          middleware: tab.middlewareHelper.get()
        }
      });

      dom.titleSpan.classList.add('text-bold');
      attachClickEvent(dom.listEl, () => {
        appImManager.setInnerPeer({peerId});
      }, {listenerSetter: tab.listenerSetter});

      dom.lastMessageSpan.append(formatFullSentTime(chatInvite.date));
      tab.scrollable.append(section.container);
    }

    if(chatInvite.subscription_pricing) {
      const section = new SettingSection({name: 'InviteLink.Observe.Fee'});

      const row = new UsernameRow(true, 'link_paid', 'green');

      const stars = chatInvite.subscription_pricing.amount;
      const usage = chatInvite.usage ?? 0;
      const title = i18n('InviteLink.Observe.Fee.Title', [StarsAmount({stars}) as HTMLElement, usage]);
      const subtitle = i18n('InviteLink.Observe.Fee.Subtitle', ['$' + (usage * +stars * 0.02).toFixed(2)]);
      row.title.append(title);
      row.subtitle.append(subtitle);

      section.content.append(row.container);

      tab.scrollable.append(section.container);
    }

    if(chatInvite.usage_limit && !chatInvite.usage && (!chatInvite.expire_date || chatInvite.expire_date > tsNow(true))) {
      const section = new SettingSection({});
      const row = new Row({
        title: i18n('PeopleCanJoinViaLinkCount', [chatInvite.usage_limit])
      });
      section.content.append(row.container);
      tab.scrollable.append(section.container);
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
        managers: tab.managers,
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
            loadPromises,
            wrapOptions: {
              middleware: tab.middlewareHelper.get()
            }
          });

          dialogElements.set(peerId, dialogElement);
          dialogElement.dom.lastMessageSpan.append(formatFullSentTime(importersMap.get(peerId).date));
        });

        return Promise.all(loadPromises);
      };

      const chatlist = appDialogsManager.createChatList();
      section.content.append(chatlist);
      tab.scrollable.append(section.container);

      let target: HTMLElement;
      const toggleRequest = async(add: boolean) => {
        const peerId = target.dataset.peerId.toPeerId();
        const dialogElement = dialogElements.get(peerId);
        const toggle = dialogElement.toggleDisability(true);
        try {
          await tab.managers.appChatsManager.hideChatJoinRequest(chatId, peerId, add);
          dialogElement.remove();
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
        listenerSetter: tab.listenerSetter,
        middleware: tab.middlewareHelper.get(),
        findElement: (e) => target = findUpClassName(e.target, 'chatlist-chat')
      });

      promises.push(load('', () => true).then(onResult));
    }

    if(chatInvite.usage) {
      const {importersMap, load} = getImportersLoader({
        chatId,
        managers: tab.managers,
        link: chatInvite.link,
        requested: false
      });

      const deferred = deferredPromise<void>();
      const selector = new AppSelectPeers({
        middleware: tab.middlewareHelper.get(),
        appendTo: tab.container,
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
        managers: tab.managers,
        noSearch: true,
        multiSelect: false
      });

      tab.content.remove();
      selector.scrollable.attachBorderListeners(tab.container);
      selector.scrollable.prepend(...Array.from(tab.scrollable.container.children));

      if(chatInvite.usage_limit) {
        const i = i18n('PeopleJoinedRemaining', [chatInvite.usage_limit - chatInvite.usage]);
        i.classList.add('sidebar-left-section-name-right');
        selector.section.title.append(i);
      }

      promises.push(deferred);
    }

    await Promise.all(promises);
  })());

  return null;
};

export default ChatInviteLinkTab;
