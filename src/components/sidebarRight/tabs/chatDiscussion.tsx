import {Component} from 'solid-js';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import findUpClassName from '@helpers/dom/findUpClassName';
import shake from '@helpers/dom/shake';
import toggleDisability from '@helpers/dom/toggleDisability';
import {Chat} from '@layer';
import appDialogsManager from '@lib/appDialogsManager';
import hasRights from '@appManagers/utils/chats/hasRights';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import Button from '@components/button';
import confirmationPopup from '@components/confirmationPopup';
import SettingSection from '@components/settingSection';
import {AppNewGroupTab} from '@components/solidJsTabs/tabs';
import {toastNew} from '@components/toast';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppChatDiscussionTab} from '@components/solidJsTabs/tabs';

const ChatDiscussion: Component = () => {
  const [tab] = useSuperTab<typeof AppChatDiscussionTab>();
  const promiseCollector = usePromiseCollector();
  const {appImManager, lottieLoader} = useHotReloadGuard();
  const {chatId} = tab.payload;

  let linkedChatId = tab.payload.linkedChatId;

  promiseCollector.collect((async() => {
    const p = {
      animationData: lottieLoader.loadAnimationFromURLManually('UtyanDiscussion'),
      chats: tab.managers.appChatsManager.getGroupsForDiscussion()
    };

    const [isBroadcast, chat, linkedChat] = await Promise.all([
      tab.managers.appChatsManager.isBroadcast(chatId),
      tab.managers.appChatsManager.getChat(chatId) as Promise<Chat.channel | Chat.chat>,
      linkedChatId && tab.managers.appChatsManager.getChat(linkedChatId) as Promise<Chat.channel | Chat.chat>
    ]);

    const canChangeInfo = hasRights(chat, 'change_info');

    tab.title.replaceChildren(i18n(isBroadcast ? 'DiscussionController.Channel.Title' : 'DiscussionController.Group.Title'));
    tab.container.classList.add('chat-folders-container', 'chat-discussion-container');

    const stickerContainer = document.createElement('div');
    stickerContainer.classList.add('sticker-container');

    const caption = document.createElement('div');
    caption.classList.add('caption');

    const setCaption = async() => {
      caption.replaceChildren(i18n(
        linkedChatId ? (isBroadcast ? 'DiscussionChannelGroupSetHelp2' : 'DiscussionGroupHelp') : 'DiscussionChannelHelp3',
        linkedChatId ? [await wrapPeerTitle({peerId: linkedChatId.toPeerId(true)})] : undefined
      ));
    };

    const section = new SettingSection({
      caption: isBroadcast ? 'DiscussionChannelHelp2' : 'DiscussionGroupHelp2'
    });

    const chatlist = appDialogsManager.createChatList();
    chatlist.classList.add('chatlist');

    const setDiscussionGroup = async(id: ChatId, groupId: ChatId) => {
      return handleChannelsTooMuch(() => {
        return tab.managers.appChatsManager.setDiscussionGroup(id, groupId);
      });
    };

    let busy = false;
    attachClickEvent(chatlist, async(e) => {
      const el = findUpClassName(e.target, 'chatlist-chat');
      if(!el) {
        return;
      }

      const peerId = el.dataset.peerId.toPeerId();

      if(linkedChatId) {
        appImManager.setInnerPeer({peerId});
        return;
      }

      if(busy) {
        return;
      }

      if(await tab.managers.appPeersManager.isForum(peerId)) {
        toastNew({langPackKey: 'ChannelTopicsDiscussionForbidden'});
        shake(el);
        return;
      }

      const d = document.createDocumentFragment();
      d.append(
        i18n('Discussion.Set.Modal.Text.PublicChannelPublicGroup', [
          await wrapPeerTitle({peerId}),
          await wrapPeerTitle({peerId: chatId.toPeerId(true)})
        ])
      );

      const [isPublicGroup, isPublicChannel, groupChatFull] = await Promise.all([
        tab.managers.appChatsManager.isPublic(peerId.toChatId()),
        tab.managers.appChatsManager.isPublic(chatId),
        tab.managers.appProfileManager.getChatFull(peerId.toChatId())
      ]);

      const br = document.createElement('br');
      if(!isPublicChannel) {
        d.append(br.cloneNode(), br.cloneNode(), i18n('Discussion.Set.PrivateChannel'));
      }

      if(!isPublicGroup) {
        d.append(br.cloneNode(), br.cloneNode(), i18n('Discussion.Set.PrivateGroup'));
      }

      if(groupChatFull._ === 'chatFull' || groupChatFull.pFlags.hidden_prehistory) {
        d.append(br.cloneNode(), br.cloneNode(), i18n('DiscussionLinkGroupAlertHistory'));
      }

      await confirmationPopup({
        peerId: chatId.toPeerId(true),
        description: d,
        button: {
          langKey: 'DiscussionLinkGroup'
        }
      });

      busy = true;
      try {
        await setDiscussionGroup(chatId, peerId.toChatId());
      } catch(err) {
        console.error('setDiscussionGroup error', err);
      }
      busy = false;
    }, {listenerSetter: tab.listenerSetter});

    let createGroupBtn: HTMLElement;
    if(isBroadcast) {
      createGroupBtn = Button('btn-primary btn-transparent primary', {icon: 'newgroup', text: 'DiscussionCreateGroup'});
      attachClickEvent(createGroupBtn, async() => {
        let title = await getPeerTitle({peerId: chatId.toPeerId(true), plainText: true});
        title += ' Chat';

        const subTab = tab.slider.createTab(AppNewGroupTab);
        subTab.open({
          peerIds: [],
          onCreate: (newChatId) => {
            tab.slider.removeTabFromHistory(tab);
            setDiscussionGroup(chatId, newChatId);
          },
          openAfter: false,
          title,
          asChannel: true
        });
      }, {listenerSetter: tab.listenerSetter});

      section.content.append(createGroupBtn);
    }

    section.content.append(chatlist);

    const unlinkSection = new SettingSection({});
    const btnUnlink = Button('btn-primary btn-transparent danger', {icon: 'delete', text: isBroadcast ? 'DiscussionUnlinkGroup' : 'DiscussionUnlinkChannel'});
    unlinkSection.content.append(btnUnlink);

    attachClickEvent(btnUnlink, async() => {
      const _linkedChatId = linkedChatId;
      await confirmationPopup({
        descriptionLangKey: isBroadcast ? 'DiscussionUnlinkChannelAlert' : 'DiscussionUnlinkGroupAlert',
        descriptionLangArgs: [await wrapPeerTitle({peerId: _linkedChatId.toPeerId(true)})],
        button: {
          langKey: 'DiscussionUnlink'
        }
      });

      const toggle = toggleDisability([btnUnlink], true);
      try {
        await setDiscussionGroup(isBroadcast ? chatId : _linkedChatId, undefined);
      } catch(err) {

      }

      if(!isBroadcast) {
        tab.close();
        return;
      }

      toggle();
    }, {listenerSetter: tab.listenerSetter});

    tab.scrollable.append(
      stickerContainer,
      caption,
      section.container,
      unlinkSection.container
    );

    const loadPromises: Promise<any>[] = [];

    const loadAnimationPromise = p.animationData.then(async(cb) => {
      const player = await cb({
        container: stickerContainer,
        loop: true,
        autoplay: true,
        width: 120,
        height: 120
      });

      return lottieLoader.waitForFirstFrame(player);
    });

    const loadChatsPromise = (
      isBroadcast ?
        p.chats :
        Promise.resolve([])
    ).then((chats) => {
      if(linkedChatId && !chats.some((chat) => chat.id === linkedChatId)) {
        chats.push(linkedChat);
      }

      const promises = chats.map((chat) => {
        const loadPromises: Promise<any>[] = [];
        const {dom} = appDialogsManager.addDialogNew({
          peerId: chat.id.toPeerId(true),
          container: chatlist,
          rippleEnabled: true,
          avatarSize: 'abitbigger',
          loadPromises,
          wrapOptions: {
            middleware: tab.middlewareHelper.get()
          }
        });

        const username = getPeerActiveUsernames(chat)[0];

        if(username) {
          dom.lastMessageSpan.textContent = '@' + username;
        } else {
          dom.lastMessageSpan.append(i18n(isBroadcast ? 'DiscussionController.PrivateGroup' : 'DiscussionController.PrivateChannel'));
        }

        return Promise.all(loadPromises);
      });

      return Promise.all(promises);
    });

    const update = async() => {
      await setCaption();

      if(!isBroadcast) {
        return;
      }

      (Array.from(chatlist.children) as HTMLElement[]).forEach((el) => {
        const _chatId = el.dataset.peerId.toChatId();
        el.classList.toggle('hide', linkedChatId ? linkedChatId !== _chatId : false);
      });
      unlinkSection.container.classList.toggle('hide', !linkedChatId || !canChangeInfo);
      createGroupBtn.classList.toggle('hide', !!linkedChatId || !canChangeInfo);
    };

    tab.listenerSetter.add(rootScope)('dialog_migrate', ({migrateFrom, migrateTo}) => {
      const el = chatlist.querySelector(`[data-peer-id="${migrateFrom}"]`) as HTMLElement;
      if(el) {
        el.dataset.peerId = '' + migrateTo;
      }
    });

    tab.listenerSetter.add(rootScope)('chat_full_update', async(updatedChatId) => {
      if(chatId !== updatedChatId) {
        return;
      }

      const channelFull = await tab.managers.appProfileManager.getChannelFull(updatedChatId);
      linkedChatId = channelFull.linked_chat_id;
      update();
    });

    loadPromises.push(loadAnimationPromise, loadChatsPromise);

    await Promise.all(loadPromises);
    await update();
  })());

  return null;
};

export default ChatDiscussion;
