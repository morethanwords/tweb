/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import shake from '../../../helpers/dom/shake';
import toggleDisability from '../../../helpers/dom/toggleDisability';
import appDialogsManager from '../../../lib/appManagers/appDialogsManager';
import appImManager from '../../../lib/appManagers/appImManager';
import getPeerActiveUsernames from '../../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import {i18n, i18n_} from '../../../lib/langPack';
import lottieLoader from '../../../lib/rlottie/lottieLoader';
import rootScope from '../../../lib/rootScope';
import Button from '../../button';
import confirmationPopup from '../../confirmationPopup';
import SettingSection from '../../settingSection';
import AppNewGroupTab from '../../sidebarLeft/tabs/newGroup';
import {SliderSuperTabEventable} from '../../sliderTab';
import {toastNew} from '../../toast';
import getPeerTitle from '../../wrappers/getPeerTitle';
import wrapPeerTitle from '../../wrappers/peerTitle';

export default class AppChatDiscussionTab extends SliderSuperTabEventable {
  public chatId: ChatId;
  public linkedChatId: ChatId;

  private caption: HTMLElement;
  private isBroadcast: boolean;

  public static getInitArgs() {
    return {
      animationData: lottieLoader.loadAnimationFromURLManually('UtyanDiscussion'),
      chats: rootScope.managers.appChatsManager.getGroupsForDiscussion()
    };
  }

  private async setCaption() {
    this.caption.replaceChildren(i18n(
      this.linkedChatId ? (this.isBroadcast ? 'DiscussionChannelGroupSetHelp2' : 'DiscussionGroupHelp') : 'DiscussionChannelHelp3',
      this.linkedChatId ? [await wrapPeerTitle({peerId: this.linkedChatId.toPeerId(true)})] : undefined
    ));
  }

  public async init({
    chatId,
    linkedChatId,
    p = AppChatDiscussionTab.getInitArgs()
  }: {
    chatId: ChatId,
    linkedChatId: ChatId,
    p?: ReturnType<typeof AppChatDiscussionTab['getInitArgs']>
  }) {
    this.chatId = chatId;
    this.linkedChatId = linkedChatId;

    const [isBroadcast] = await Promise.all([
      this.managers.appChatsManager.isBroadcast(this.chatId)
    ]);

    this.isBroadcast = isBroadcast;

    this.setTitle(isBroadcast ? 'DiscussionController.Channel.Title' : 'DiscussionController.Group.Title');
    this.container.classList.add('chat-folders-container', 'chat-discussion-container');

    const stickerContainer = document.createElement('div');
    stickerContainer.classList.add('sticker-container');

    const caption = this.caption = document.createElement('div');
    caption.classList.add('caption');

    const section = new SettingSection({
      caption: isBroadcast ? 'DiscussionChannelHelp2' : 'DiscussionGroupHelp2'
    });

    const chatlist = appDialogsManager.createChatList();
    chatlist.classList.add('chatlist');

    attachClickEvent(chatlist, async(e) => {
      const el = findUpClassName(e.target, 'chatlist-chat');
      if(!el) {
        return;
      }

      const peerId = el.dataset.peerId.toPeerId();

      if(this.linkedChatId) {
        appImManager.setInnerPeer({peerId});
        return;
      }

      if(await this.managers.appPeersManager.isForum(peerId)) {
        toastNew({langPackKey: 'ChannelTopicsDiscussionForbidden'});
        shake(el);
        return;
      }

      const d = document.createDocumentFragment();
      d.append(
        i18n('Discussion.Set.Modal.Text.PublicChannelPublicGroup', [
          await wrapPeerTitle({peerId}),
          await wrapPeerTitle({peerId: this.chatId.toPeerId(true)})
        ])
      );

      const [isPublicGroup, isPublicChannel, groupChatFull] = await Promise.all([
        this.managers.appChatsManager.isPublic(peerId.toChatId()),
        this.managers.appChatsManager.isPublic(this.chatId),
        this.managers.appProfileManager.getChatFull(peerId.toChatId())
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
        peerId: this.chatId.toPeerId(true),
        description: d,
        button: {
          langKey: 'DiscussionLinkGroup'
        }
      });

      this.managers.appChatsManager.setDiscussionGroup(this.chatId, peerId.toChatId());
    }, {listenerSetter: this.listenerSetter});

    let createGroupBtn: HTMLElement;
    if(isBroadcast) {
      createGroupBtn = Button('btn-primary btn-transparent primary', {icon: 'newgroup', text: 'DiscussionCreateGroup'});
      attachClickEvent(createGroupBtn, async() => {
        let title = await getPeerTitle({peerId: this.chatId.toPeerId(true), plainText: true});
        title += ' Chat';

        const tab = this.slider.createTab(AppNewGroupTab);
        tab.open({
          peerIds: [],
          onCreate: (chatId) => {
            this.slider.removeTabFromHistory(this);
            this.managers.appChatsManager.setDiscussionGroup(this.chatId, chatId);
          },
          openAfter: false,
          title,
          asChannel: true
        });
      }, {listenerSetter: this.listenerSetter});

      section.content.append(createGroupBtn);
    }

    section.content.append(chatlist);

    const unlinkSection = new SettingSection({});
    const btnUnlink = Button('btn-primary btn-transparent danger', {icon: 'delete', text: isBroadcast ? 'DiscussionUnlinkGroup' : 'DiscussionUnlinkChannel'});
    unlinkSection.content.append(btnUnlink);

    attachClickEvent(btnUnlink, async() => {
      const linkedChatId = this.linkedChatId;
      await confirmationPopup({
        descriptionLangKey: isBroadcast ? 'DiscussionUnlinkChannelAlert' : 'DiscussionUnlinkGroupAlert',
        descriptionLangArgs: [await wrapPeerTitle({peerId: linkedChatId.toPeerId(true)})],
        button: {
          langKey: 'DiscussionUnlink'
        }
      });

      const toggle = toggleDisability([btnUnlink], true);
      try {
        await this.managers.appChatsManager.setDiscussionGroup(isBroadcast ? this.chatId : linkedChatId, undefined);
      } catch(err) {

      }

      if(!isBroadcast) {
        this.close();
        return;
      }

      toggle();
    }, {listenerSetter: this.listenerSetter});

    this.scrollable.append(
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
        Promise.resolve([await this.managers.appChatsManager.getChat(this.linkedChatId)])
    ).then((chats) => {
      const promises = chats.map((chat) => {
        const loadPromises: Promise<any>[] = [];
        const {dom} = appDialogsManager.addDialogNew({
          peerId: chat.id.toPeerId(true),
          container: chatlist,
          rippleEnabled: true,
          avatarSize: 'abitbigger',
          loadPromises,
          wrapOptions: {
            middleware: this.middlewareHelper.get()
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
      await this.setCaption();

      if(!isBroadcast) {
        return;
      }

      (Array.from(chatlist.children) as HTMLElement[]).forEach((el) => {
        const chatId = el.dataset.peerId.toChatId();
        el.classList.toggle('hide', this.linkedChatId ? this.linkedChatId !== chatId : false);
      });
      unlinkSection.container.classList.toggle('hide', !this.linkedChatId);
      createGroupBtn.classList.toggle('hide', !!this.linkedChatId);
    };

    this.listenerSetter.add(rootScope)('dialog_migrate', ({migrateFrom, migrateTo}) => {
      const el = chatlist.querySelector(`[data-peer-id="${migrateFrom}"]`) as HTMLElement;
      if(el) {
        el.dataset.peerId = '' + migrateTo;
      }
    });

    this.listenerSetter.add(rootScope)('chat_full_update', async(chatId) => {
      if(this.chatId !== chatId) {
        return;
      }

      const channelFull = await this.managers.appProfileManager.getChannelFull(chatId);
      this.linkedChatId = channelFull.linked_chat_id;
      update();
    });

    loadPromises.push(loadAnimationPromise, loadChatsPromise);

    return Promise.all(loadPromises).then(() => {
      return update();
    });
  }
}
