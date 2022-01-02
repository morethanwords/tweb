/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PARALLAX_SUPPORTED from "../environment/parallaxSupport";
import { copyTextToClipboard } from "../helpers/clipboard";
import replaceContent from "../helpers/dom/replaceContent";
import { fastRaf } from "../helpers/schedulers";
import { User } from "../layer";
import { Channel } from "../lib/appManagers/appChatsManager";
import appImManager from "../lib/appManagers/appImManager";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appNotificationsManager from "../lib/appManagers/appNotificationsManager";
import appPeersManager from "../lib/appManagers/appPeersManager";
import appProfileManager from "../lib/appManagers/appProfileManager";
import appUsersManager from "../lib/appManagers/appUsersManager";
import I18n from "../lib/langPack";
import RichTextProcessor from "../lib/richtextprocessor";
import rootScope from "../lib/rootScope";
import AvatarElement from "./avatar";
import CheckboxField from "./checkboxField";
import generateVerifiedIcon from "./generateVerifiedIcon";
import PeerProfileAvatars from "./peerProfileAvatars";
import PeerTitle from "./peerTitle";
import Row from "./row";
import Scrollable from "./scrollable";
import { SettingSection, generateDelimiter } from "./sidebarLeft";
import { toast } from "./toast";

let setText = (text: string, row: Row) => {
  //fastRaf(() => {
    row.title.innerHTML = text;
    row.container.style.display = '';
  //});
};

export default class PeerProfile {
  public element: HTMLElement;
  public avatars: PeerProfileAvatars;
  private avatar: AvatarElement;
  private section: SettingSection;
  private name: HTMLDivElement;
  private subtitle: HTMLDivElement;
  private bio: Row;
  private username: Row;
  private phone: Row;
  private notifications: Row;
  private location: Row;
  
  private cleaned: boolean;
  private setMoreDetailsTimeout: number;
  private setPeerStatusInterval: number;

  private peerId: PeerId;
  private threadId: number;

  constructor(public scrollable: Scrollable) {
    if(!PARALLAX_SUPPORTED) {
      this.scrollable.container.classList.add('no-parallax');
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
    this.avatar.setAttribute('dialog', '1');
    this.avatar.setAttribute('clickable', '');

    this.name = document.createElement('div');
    this.name.classList.add('profile-name');

    this.subtitle = document.createElement('div');
    this.subtitle.classList.add('profile-subtitle');

    this.bio = new Row({
      title: ' ',
      subtitleLangKey: 'UserBio',
      icon: 'info',
      clickable: (e) => {
        if((e.target as HTMLElement).tagName === 'A') {
          return;
        }
        
        appProfileManager.getProfileByPeerId(this.peerId).then(full => {
          copyTextToClipboard(full.about);
          toast(I18n.format('BioCopied', true));
        });
      }
    });

    this.bio.title.classList.add('pre-wrap');

    this.username = new Row({
      title: ' ',
      subtitleLangKey: 'Username',
      icon: 'username',
      clickable: () => {
        const peer: Channel | User.user = appPeersManager.getPeer(this.peerId);
        copyTextToClipboard('@' + peer.username);
        toast(I18n.format('UsernameCopied', true));
      }
    });

    this.phone = new Row({
      title: ' ',
      subtitleLangKey: 'Phone',
      icon: 'phone',
      clickable: () => {
        const peer: User = appUsersManager.getUser(this.peerId);
        copyTextToClipboard('+' + peer.phone);
        toast(I18n.format('PhoneCopied', true));
      }
    });

    this.location = new Row({
      title: ' ',
      subtitleLangKey: 'ChatLocation',
      icon: 'location'
    });

    this.notifications = new Row({
      checkboxField: new CheckboxField({toggle: true}),
      titleLangKey: 'Notifications',
      icon: 'unmute'
    });
    
    this.section.content.append(
      this.phone.container,
      this.username.container,
      this.location.container,
      this.bio.container,
      this.notifications.container
    );

    this.element.append(this.section.container, generateDelimiter());

    this.notifications.checkboxField.input.addEventListener('change', (e) => {
      if(!e.isTrusted) {
        return;
      }

      //let checked = this.notificationsCheckbox.checked;
      appMessagesManager.mutePeer(this.peerId);
    });

    rootScope.addEventListener('dialog_notify_settings', (dialog) => {
      if(this.peerId === dialog.peerId) {
        const muted = appNotificationsManager.isPeerLocalMuted(this.peerId, false);
        this.notifications.checkboxField.checked = !muted;
      }
    });

    rootScope.addEventListener('peer_typings', ({peerId}) => {
      if(this.peerId === peerId) {
        this.setPeerStatus();
      }
    });

    rootScope.addEventListener('peer_bio_edit', (peerId) => {
      if(peerId === this.peerId) {
        this.setMoreDetails(true);
      }
    });

    rootScope.addEventListener('user_update', (userId) => {
      if(this.peerId === userId) {
        this.setPeerStatus();
      }
    });

    rootScope.addEventListener('contacts_update', (userId) => {
      if(this.peerId === userId) {
        const user = appUsersManager.getUser(userId);
        if(!user.pFlags.self) {
          if(user.phone) {
            setText(appUsersManager.formatUserPhone(user.phone), this.phone);
          } else {
            this.phone.container.style.display = 'none';
          }
        }
      }
    });

    this.setPeerStatusInterval = window.setInterval(this.setPeerStatus, 60e3);
  }

  public setPeerStatus = (needClear = false) => {
    if(!this.peerId) return;

    const peerId = this.peerId;
    appImManager.setPeerStatus(this.peerId, this.subtitle, needClear, true, () => peerId === this.peerId);
  };

  public cleanupHTML() {
    this.bio.container.style.display = 'none';
    this.phone.container.style.display = 'none';
    this.username.container.style.display = 'none';
    this.location.container.style.display = 'none';
    this.notifications.container.style.display = '';
    this.notifications.checkboxField.checked = true;
    if(this.setMoreDetailsTimeout) {
      window.clearTimeout(this.setMoreDetailsTimeout);
      this.setMoreDetailsTimeout = 0;
    }
  }

  public setAvatar() {
    if(this.peerId !== rootScope.myId) {
      const photo = appPeersManager.getPeerPhoto(this.peerId);

      if(photo) {
        const oldAvatars = this.avatars;
        this.avatars = new PeerProfileAvatars(this.scrollable);
        this.avatars.setPeer(this.peerId);
        this.avatars.info.append(this.name, this.subtitle);
  
        this.avatar.remove();
    
        if(oldAvatars) oldAvatars.container.replaceWith(this.avatars.container);
        else this.element.prepend(this.avatars.container);

        if(PARALLAX_SUPPORTED) {
          this.scrollable.container.classList.add('parallax');
        }

        return;
      }
    }

    if(PARALLAX_SUPPORTED) {
      this.scrollable.container.classList.remove('parallax');
    }

    if(this.avatars) {
      this.avatars.container.remove();
      this.avatars = undefined;
    }

    this.avatar.setAttribute('peer', '' + this.peerId);

    this.section.content.prepend(this.avatar, this.name, this.subtitle);
  }

  public fillProfileElements() {
    if(!this.cleaned) return;
    this.cleaned = false;
    
    const peerId = this.peerId;

    this.cleanupHTML();

    this.setAvatar();

    // username
    if(peerId !== rootScope.myId) {
      let username = appPeersManager.getPeerUsername(peerId);
      if(username) {
        setText(appPeersManager.getPeerUsername(peerId), this.username);
      }
      
      const muted = appNotificationsManager.isPeerLocalMuted(peerId, false);
      this.notifications.checkboxField.checked = !muted;
    } else {
      fastRaf(() => {
        this.notifications.container.style.display = 'none';
      });
    }
    
    //let membersLi = this.profileTabs.firstElementChild.children[0] as HTMLLIElement;
    if(peerId.isUser()) {
      //membersLi.style.display = 'none';

      let user = appUsersManager.getUser(peerId);
      if(user.phone && peerId !== rootScope.myId) {
        setText(appUsersManager.formatUserPhone(user.phone), this.phone);
      }
    }/*  else {
      //membersLi.style.display = appPeersManager.isBroadcast(peerId) ? 'none' : '';
    } */

    this.setMoreDetails();

    replaceContent(this.name, new PeerTitle({
      peerId,
      dialog: true,
    }).element);

    const peer = appPeersManager.getPeer(peerId);
    if(peer?.pFlags?.verified) {
      this.name.append(generateVerifiedIcon());
    }

    this.setPeerStatus(true);
  }

  public setMoreDetails(override?: true) {
    if(this.setMoreDetailsTimeout) {
      window.clearTimeout(this.setMoreDetailsTimeout);
      this.setMoreDetailsTimeout = 0;
    }

    const peerId = this.peerId;
    const threadId = this.threadId;

    if(!peerId) {
      return;
    }

    let promise: Promise<boolean>;
    if(peerId.isUser()) {
      promise = appProfileManager.getProfile(peerId, override).then(userFull => {
        if(this.peerId !== peerId || this.threadId !== threadId) {
          //this.log.warn('peer changed');
          return false;
        }
        
        if(userFull.rAbout && peerId !== rootScope.myId) {
          setText(userFull.rAbout, this.bio);
        }

        this.location.container.style.display = 'none';
        
        //this.log('userFull', userFull);
        return true;
      });
    } else {
      promise = appProfileManager.getChatFull(peerId.toChatId(), override).then((chatFull) => {
        if(this.peerId !== peerId || this.threadId !== threadId) {
          //this.log.warn('peer changed');
          return false;
        }
        
        //this.log('chatInfo res 2:', chatFull);
        
        if(chatFull.about) {
          setText(RichTextProcessor.wrapRichText(chatFull.about), this.bio);
        }

        // @ts-ignore
        if(chatFull?.location?._ == 'channelLocation') {
          // @ts-ignore
          setText(RichTextProcessor.wrapRichText(chatFull.location.address), this.location);
        }else{
          this.location.container.style.display = 'none';
        }

        return true;
      });
    }

    promise.then((canSetNext) => {
      if(canSetNext) {
        this.setMoreDetailsTimeout = window.setTimeout(() => this.setMoreDetails(true), 60e3);
      }
    });
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
}
