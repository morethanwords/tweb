/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_PARALLAX_SUPPORTED from "../environment/parallaxSupport";
import { copyTextToClipboard } from "../helpers/clipboard";
import replaceContent from "../helpers/dom/replaceContent";
import setInnerHTML from "../helpers/dom/setInnerHTML";
import ListenerSetter from "../helpers/listenerSetter";
import { fastRaf } from "../helpers/schedulers";
import { Chat, ChatFull, User, UserFull } from "../layer";
import type { Channel } from "../lib/appManagers/appChatsManager";
import appImManager from "../lib/appManagers/appImManager";
import { AppManagers } from "../lib/appManagers/managers";
import I18n from "../lib/langPack";
import wrapRichText from "../lib/richTextProcessor/wrapRichText";
import rootScope from "../lib/rootScope";
import AvatarElement from "./avatar";
import CheckboxField from "./checkboxField";
import generateTitleIcons from "./generateTitleIcons";
import PeerProfileAvatars from "./peerProfileAvatars";
import Row from "./row";
import Scrollable from "./scrollable";
import { SettingSection, generateDelimiter } from "./sidebarLeft";
import { toast } from "./toast";
import formatUserPhone from "./wrappers/formatUserPhone";
import wrapPeerTitle from "./wrappers/peerTitle";

let setText = (text: Parameters<typeof setInnerHTML>[1], row: Row) => {
  //fastRaf(() => {
    setInnerHTML(row.title, text || '');
    row.container.style.display = text ? '' : 'none';
  //});
};

export default class PeerProfile {
  public element: HTMLElement;
  private avatars: PeerProfileAvatars;
  private avatar: AvatarElement;
  private section: SettingSection;
  private name: HTMLDivElement;
  private subtitle: HTMLDivElement;
  private bio: Row;
  private username: Row;
  private phone: Row;
  private notifications: Row;
  private location: Row;
  private link: Row;
  
  private cleaned: boolean;
  private setMoreDetailsTimeout: number;
  private setPeerStatusInterval: number;

  private peerId: PeerId;
  private threadId: number;

  constructor(
    private managers: AppManagers,
    public scrollable: Scrollable, 
    private listenerSetter?: ListenerSetter,
    private isDialog = true
  ) {
    if(!IS_PARALLAX_SUPPORTED) {
      this.scrollable.container.classList.add('no-parallax');
    }

    if(!listenerSetter) {
      this.listenerSetter = new ListenerSetter();
    }
  }

  public init() {
    this.init = null;


    this.element = document.createElement('div');
    this.element.classList.add('profile-content');

    this.section = new SettingSection({
      noDelimiter: true
    });

    this.avatar = new AvatarElement();
    this.avatar.classList.add('profile-avatar', 'avatar-120');
    this.avatar.isDialog = this.isDialog;
    this.avatar.attachClickEvent();

    this.name = document.createElement('div');
    this.name.classList.add('profile-name');

    this.subtitle = document.createElement('div');
    this.subtitle.classList.add('profile-subtitle');

    this.bio = new Row({
      title: ' ',
      subtitleLangKey: 'UserBio',
      icon: 'info',
      clickable: async(e) => {
        if((e.target as HTMLElement).tagName === 'A') {
          return;
        }
        
        const full = await this.managers.appProfileManager.getProfileByPeerId(this.peerId);
        copyTextToClipboard(full.about);
        toast(I18n.format('BioCopied', true));
      },
      listenerSetter: this.listenerSetter
    });

    this.bio.title.classList.add('pre-wrap');

    this.username = new Row({
      title: ' ',
      subtitleLangKey: 'Username',
      icon: 'username',
      clickable: async() => {
        const peer: Channel | User.user = await this.managers.appPeersManager.getPeer(this.peerId);
        copyTextToClipboard('@' + peer.username);
        toast(I18n.format('UsernameCopied', true));
      },
      listenerSetter: this.listenerSetter
    });

    this.phone = new Row({
      title: ' ',
      subtitleLangKey: 'Phone',
      icon: 'phone',
      clickable: async() => {
        const peer: User = await this.managers.appUsersManager.getUser(this.peerId);
        copyTextToClipboard('+' + peer.phone);
        toast(I18n.format('PhoneCopied', true));
      },
      listenerSetter: this.listenerSetter
    });

    this.link = new Row({
      title: ' ',
      subtitleLangKey: 'SetUrlPlaceholder',
      icon: 'link',
      clickable: () => {
        copyTextToClipboard(this.link.title.textContent);
        // Promise.resolve(appProfileManager.getChatFull(this.peerId.toChatId())).then((chatFull) => {
          // copyTextToClipboard(chatFull.exported_invite.link);
          toast(I18n.format('LinkCopied', true));
        // });
      },
      listenerSetter: this.listenerSetter
    });

    this.location = new Row({
      title: ' ',
      subtitleLangKey: 'ChatLocation',
      icon: 'location'
    });

    this.section.content.append(
      this.phone.container,
      this.username.container,
      this.location.container,
      this.bio.container,
      this.link.container
    );

    const {listenerSetter} = this;
    if(this.isDialog) {
      this.notifications = new Row({
        checkboxField: new CheckboxField({toggle: true}),
        titleLangKey: 'Notifications',
        icon: 'unmute',
        listenerSetter: this.listenerSetter
      });

      listenerSetter.add(this.notifications.checkboxField.input)('change', (e) => {
        if(!e.isTrusted) {
          return;
        }
  
        //let checked = this.notificationsCheckbox.checked;
        this.managers.appMessagesManager.togglePeerMute(this.peerId);
      });

      listenerSetter.add(rootScope)('dialog_notify_settings', async(dialog) => {
        if(this.peerId === dialog.peerId) {
          const muted = await this.managers.appNotificationsManager.isPeerLocalMuted(this.peerId, false);
          this.notifications.checkboxField.checked = !muted;
        }
      });

      this.section.content.append(this.notifications.container);
    }

    this.element.append(this.section.container);

    if(IS_PARALLAX_SUPPORTED) {
      this.element.append(generateDelimiter());
    }

    listenerSetter.add(rootScope)('peer_typings', ({peerId}) => {
      if(this.peerId === peerId) {
        this.setPeerStatus();
      }
    });

    listenerSetter.add(rootScope)('peer_bio_edit', (peerId) => {
      if(peerId === this.peerId) {
        this.setMoreDetails(true);
      }
    });

    listenerSetter.add(rootScope)('peer_title_edit', (peerId) => {
      if(peerId === this.peerId) {
        this.fillUsername();
      }
    });

    listenerSetter.add(rootScope)('user_update', (userId) => {
      if(this.peerId === userId.toPeerId()) {
        this.setPeerStatus();
      }
    });

    listenerSetter.add(rootScope)('contacts_update', async(userId) => {
      if(this.peerId === userId.toPeerId()) {
        const user = await this.managers.appUsersManager.getUser(userId);
        if(!user.pFlags.self || !this.isDialog) {
          this.fillUserPhone();
        }
      }
    });

    listenerSetter.add(rootScope)('avatar_update', (peerId) => {
      if(this.peerId === peerId) {
        // const photo = appPeersManager.getPeerPhoto(peerId);
        // if(!photo && this.avatars) {
          this.setAvatar();
        // }
      }
    });

    this.setPeerStatusInterval = window.setInterval(this.setPeerStatus, 60e3);
  }

  private setPeerStatus = (needClear = false) => {
    const peerId = this.peerId;
    this.element.classList.toggle('is-me', peerId === rootScope.myId);
    if(!peerId || (rootScope.myId === peerId && this.isDialog)) return;

    return appImManager.setPeerStatus(
      peerId, 
      this.subtitle, 
      needClear, 
      true, 
      () => peerId === this.peerId, 
      !this.isDialog
    ).then((callback) => {
      if(callback) {
        callback();
      }
    });
  };

  public cleanupHTML() {
    [
      this.bio,
      this.phone,
      this.username,
      this.location,
      this.link
    ].forEach((row) => {
      row.container.style.display = 'none';
    });

    if(this.notifications) {
      this.notifications.container.style.display = '';
      this.notifications.checkboxField.checked = true;
    }

    this.clearSetMoreDetailsTimeout();
  }

  private canBeDetailed() {
    return this.peerId !== rootScope.myId || !this.isDialog;
  }

  private async setAvatar() {
    if(this.canBeDetailed()) {
      const photo = await this.managers.appPeersManager.getPeerPhoto(this.peerId);

      if(photo) {
        const oldAvatars = this.avatars;
        this.avatars = new PeerProfileAvatars(this.scrollable, this.managers);
        await this.avatars.setPeer(this.peerId);
        this.avatars.info.append(this.name, this.subtitle);
  
        this.avatar.remove();
    
        if(oldAvatars) oldAvatars.container.replaceWith(this.avatars.container);
        else this.element.prepend(this.avatars.container);

        if(IS_PARALLAX_SUPPORTED) {
          this.scrollable.container.classList.add('parallax');
        }

        return;
      }
    }

    if(IS_PARALLAX_SUPPORTED) {
      this.scrollable.container.classList.remove('parallax');
    }

    if(this.avatars) {
      this.avatars.container.remove();
      this.avatars.cleanup();
      this.avatars = undefined;
    }

    await this.avatar.updateWithOptions({peerId: this.peerId});

    this.section.content.prepend(this.avatar, this.name, this.subtitle);
  }

  private async fillUsername() {
    const {peerId} = this;
    if(peerId.isUser() && this.canBeDetailed()) {
      const username = await this.managers.appPeersManager.getPeerUsername(peerId);
      return setText(username, this.username);
    }
  }

  private async fillUserPhone() {
    const {peerId} = this;
    if(peerId.isUser() && this.canBeDetailed()) {
      const user = await this.managers.appUsersManager.getUser(peerId);
      return setText(user.phone ? formatUserPhone(user.phone) : undefined, this.phone);
    }
  }

  private async fillNotifications() {
    const notificationsRow = this.notifications;
    if(!notificationsRow) {
      return;
    }

    if(this.canBeDetailed()) {
      const muted = await this.managers.appNotificationsManager.isPeerLocalMuted(this.peerId, false);
      notificationsRow.checkboxField.checked = !muted;
    } else {
      fastRaf(() => {
        notificationsRow.container.style.display = 'none';
      });
    }
  }

  private async fillRows() {
    const peerId = this.peerId;

    await Promise.all([
      this.fillUsername(),
      this.fillUserPhone(),
      this.fillNotifications(),
      this.setMoreDetails(),
      (async() => {
        const [element, icons] = await Promise.all([
          wrapPeerTitle({
            peerId,
            dialog: this.isDialog,
          }),

          generateTitleIcons(peerId)
        ]);
        replaceContent(this.name, element);
        this.name.append(...icons);
      })(),
      this.setPeerStatus(true)
    ]);
  }

  public async fillProfileElements() {
    if(!this.cleaned) return;
    this.cleaned = false;
    
    this.cleanupHTML();
    await Promise.all([
      this.setAvatar(),
      this.fillRows(),
    ]);
  }

  private async _setMoreDetails(peerId: PeerId, peerFull: ChatFull | UserFull) {
    // if(peerFull.about) {
    setText(peerFull.about ? wrapRichText(peerFull.about) : undefined, this.bio);
    // }

    if(!peerId.isUser()) {
      const chat: Chat.channel = await this.managers.appChatsManager.getChat(peerId.toChatId());
      if(chat.username) {
        setText('https://t.me/' + chat.username, this.link);
      } else {
        const exportedInvite = (peerFull as ChatFull.channelFull).exported_invite;
        if(exportedInvite?._ === 'chatInviteExported') {
          setText(exportedInvite.link, this.link);
        }
      }
    }

    const location = (peerFull as ChatFull.channelFull).location;
    if(location?._ == 'channelLocation') {
      setText(location.address, this.location);
    }

    this.setMoreDetailsTimeout = window.setTimeout(() => this.setMoreDetails(true), 60e3);
  }

  private async setMoreDetails(override?: true) {
    this.clearSetMoreDetailsTimeout();

    const peerId = this.peerId;
    const threadId = this.threadId;

    if(!peerId || await this.managers.appPeersManager.isRestricted(peerId) || !this.canBeDetailed()) {
      return;
    }

    const result = await this.managers.acknowledged.appProfileManager.getProfileByPeerId(peerId, override);
    const setPromise = result.result.then(async(peerFull) => {
      if(this.peerId !== peerId || this.threadId !== threadId || await this.managers.appPeersManager.isRestricted(peerId)) {
        //this.log.warn('peer changed');
        return;
      }
      
      await this._setMoreDetails(peerId, peerFull);
    });

    if(result.cached) {
      await setPromise;
    }
  }

  public setPeer(peerId: PeerId, threadId = 0) {
    if(this.peerId === peerId && this.threadId === threadId) return;

    if(this.init) {
      this.init();
    }

    this.peerId = peerId;
    this.threadId = threadId;
    
    this.cleaned = true;
  }

  public clearSetMoreDetailsTimeout() {
    if(this.setMoreDetailsTimeout !== undefined) {
      clearTimeout(this.setMoreDetailsTimeout);
      this.setMoreDetailsTimeout = undefined;
    }
  }

  public destroy() {
    this.clearSetMoreDetailsTimeout();
    clearInterval(this.setPeerStatusInterval);
    this.avatars?.cleanup();
  }
}
