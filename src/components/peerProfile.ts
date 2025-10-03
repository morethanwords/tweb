/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_PARALLAX_SUPPORTED from '../environment/parallaxSupport';
import deferredPromise from '../helpers/cancellablePromise';
import {copyTextToClipboard} from '../helpers/clipboard';
import anchorCopy from '../helpers/dom/anchorCopy';
import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent, simulateClickEvent} from '../helpers/dom/clickEvent';
import replaceContent from '../helpers/dom/replaceContent';
import safeWindowOpen from '../helpers/dom/safeWindowOpen';
import setInnerHTML from '../helpers/dom/setInnerHTML';
import getWebFileLocation from '../helpers/getWebFileLocation';
import ListenerSetter from '../helpers/listenerSetter';
import makeError from '../helpers/makeError';
import makeGoogleMapsUrl from '../helpers/makeGoogleMapsUrl';
import {makeMediaSize} from '../helpers/mediaSize';
import {getMiddleware, Middleware, MiddlewareHelper} from '../helpers/middleware';
import middlewarePromise from '../helpers/middlewarePromise';
import numberThousandSplitter from '../helpers/number/numberThousandSplitter';
import pause from '../helpers/schedulers/pause';
import {BusinessLocation, BusinessWorkHours, Chat, ChatFull, GeoPoint, HelpTimezonesList, Timezone, UserFull, UserStatus} from '../layer';
import appDialogsManager from '../lib/appManagers/appDialogsManager';
import appImManager from '../lib/appManagers/appImManager';
import {AppManagers} from '../lib/appManagers/managers';
import getServerMessageId from '../lib/appManagers/utils/messageId/getServerMessageId';
import getPeerActiveUsernames from '../lib/appManagers/utils/peers/getPeerActiveUsernames';
import I18n, {i18n, join} from '../lib/langPack';
import {MTAppConfig} from '../lib/mtproto/appConfig';
import {HIDDEN_PEER_ID} from '../lib/mtproto/mtproto_config';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';
import wrapEmojiText from '../lib/richTextProcessor/wrapEmojiText';
import wrapRichText from '../lib/richTextProcessor/wrapRichText';
import rootScope from '../lib/rootScope';
import {avatarNew} from './avatarNew';
import BusinessHours from './businessHours';
import CheckboxField from './checkboxField';
import confirmationPopup from './confirmationPopup';
import {generateDelimiter} from './generateDelimiter';
import PeerProfileAvatars, {SHOW_NO_AVATAR} from './peerProfileAvatars';
import PopupElement from './popups';
import PopupToggleReadDate from './popups/toggleReadDate';
import Row from './row';
import Scrollable from './scrollable';
import SettingSection from './settingSection';
import {Skeleton} from './skeleton';
import {toast, toastNew} from './toast';
import formatUserPhone from './wrappers/formatUserPhone';
import wrapPeerTitle from './wrappers/peerTitle';
import wrapPhoto from './wrappers/photo';
import wrapTopicNameButton from './wrappers/topicNameButton';
import {batch, createMemo, createRoot, createSignal, JSX} from 'solid-js';
import {render} from 'solid-js/web';
import detectLanguageForTranslation from '../helpers/detectLanguageForTranslation';
import PopupPremium from './popups/premium';
import PopupTranslate from './popups/translate';
import wrapSticker from './wrappers/sticker';
import {rgbIntToHex} from '../helpers/color';
import {wrapAdaptiveCustomEmoji} from './wrappers/customEmojiSimple';
import usePeerTranslation from '../hooks/usePeerTranslation';
import {MyStarGift} from '../lib/appManagers/appGiftsManager';

const setText = (text: Parameters<typeof setInnerHTML>[1], row: Row) => {
  setInnerHTML(row.title, text || undefined);
  row.container.style.display = text ? '' : 'none';
};

export default class PeerProfile {
  public element: HTMLElement;
  private avatars: PeerProfileAvatars;
  private avatar: ReturnType<typeof avatarNew>;
  private section: SettingSection;
  private name: HTMLDivElement;
  private subtitle: HTMLDivElement;
  private bio: Row;
  private username: Row;
  private phone: Row;
  private notifications: Row;
  private location: Row;
  private link: Row;
  private businessHours: Row;
  private businessLocation: Row;

  private setBusinessHours: (hours: BusinessWorkHours) => void;
  private setTimezones: (timezones: Timezone[]) => void;

  private cleaned: boolean;
  private setMoreDetailsTimeout: number;
  private setPeerStatusInterval: number;

  private peerId: PeerId;
  private threadId: number;

  private _businessLocation: BusinessLocation;

  private middlewareHelper: MiddlewareHelper;

  private personalChannelSection: SettingSection;
  private personalChannel: Row;
  private personalChannelCounter: HTMLSpanElement;

  private botPermissionsSection: SettingSection;
  private botPermissionsEmojiStatus: Row;
  private botPermissionsLocation: Row;

  private bioLanguage: Promise<TranslatableLanguageISO>;
  private bioText: string;

  private botVerification: HTMLDivElement;

  private pinnedGiftsContainer: HTMLDivElement;

  public onPinnedGiftsChange?: (gifts: MyStarGift[]) => void;

  constructor(
    private managers: AppManagers,
    private scrollable: Scrollable,
    private listenerSetter?: ListenerSetter,
    private isDialog = true,
    private setCollapsedOn?: HTMLElement,
    private onPersonalChannel?: (has: boolean) => void
  ) {
    if(!IS_PARALLAX_SUPPORTED) {
      this.scrollable.container.classList.add('no-parallax');
    }

    if(!listenerSetter) {
      this.listenerSetter = new ListenerSetter();
    }

    this.middlewareHelper = getMiddleware();
  }

  public init() {
    this.init = null;

    this.element = document.createElement('div');
    this.element.classList.add('profile-content');

    const personalChannelName = document.createElement('span');
    personalChannelName.append(i18n('AccDescrChannel'));
    personalChannelName.classList.add('personal-channel-name');
    this.personalChannelCounter = document.createElement('span');
    this.personalChannelCounter.classList.add('personal-channel-counter');
    personalChannelName.append(this.personalChannelCounter);
    this.personalChannelSection = new SettingSection({
      name: personalChannelName
    });

    appDialogsManager.setListClickListener({
      list: this.personalChannelSection.content,
      autonomous: false,
      openInner: true
    });

    // this.personalChannel = new Row({});
    // this.channelSection.content.append(this.personalChannel.container);

    this.section = new SettingSection({
      noDelimiter: true
    });

    this.name = document.createElement('div');
    this.name.classList.add('profile-name');

    this.subtitle = document.createElement('div');
    this.subtitle.classList.add('profile-subtitle');

    this.pinnedGiftsContainer = document.createElement('div');
    this.pinnedGiftsContainer.classList.add('profile-pinned-gifts');

    this.setCollapsedOn.classList.add('profile-container');

    this.bio = new Row({
      title: ' ',
      subtitle: true,
      icon: 'info',
      clickable: (e) => {
        if((e.target as HTMLElement).tagName === 'A') {
          return;
        }

        copyTextToClipboard(this.bio.title.textContent);
        toast(I18n.format('BioCopied', true));
      },
      listenerSetter: this.listenerSetter,
      contextMenu: {
        buttons: [{
          icon: 'copy',
          text: 'Text.CopyLabel_About',
          onClick: () => {
            simulateClickEvent(this.bio.container);
          },
          verify: () => !this.peerId.isUser()
        }, {
          icon: 'copy',
          text: 'Text.CopyLabel_Bio',
          onClick: () => {
            simulateClickEvent(this.bio.container);
          },
          verify: () => this.peerId.isUser()
        }, {
          icon: 'premium_translate',
          text: 'TranslateMessage',
          onClick: async() => {
            const peerTranslation = usePeerTranslation(this.peerId);
            if(!peerTranslation.canTranslate(true)) {
              PopupPremium.show({feature: 'translations'});
            } else {
              PopupElement.createPopup(PopupTranslate, {
                peerId: this.peerId,
                textWithEntities: {
                  _: 'textWithEntities',
                  text: this.bioText,
                  entities: []
                },
                detectedLanguage: await this.bioLanguage
              });
            }
          },
          verify: async() => !!(await this.bioLanguage)
        }]
      }
    });

    this.bio.title.classList.add('pre-wrap');

    this.username = new Row({
      title: ' ',
      subtitleLangKey: 'Username',
      icon: 'username',
      clickable: () => {
        // const username = await this.managers.appPeersManager.getPeerUsername(this.peerId);
        copyTextToClipboard('@' + this.username.title.textContent);
        toast(I18n.format('UsernameCopied', true));
      },
      listenerSetter: this.listenerSetter,
      contextMenu: {
        buttons: [{
          icon: 'copy',
          text: 'Text.CopyLabel_Username',
          onClick: () => {
            simulateClickEvent(this.username.container);
          }
        }]
      }
    });

    this.phone = new Row({
      title: ' ',
      subtitle: true,
      icon: 'phone',
      clickable: () => {
        copyTextToClipboard(this.phone.title.textContent.replace(/\s/g, ''));
        toast(I18n.format('PhoneCopied', true));
      },
      listenerSetter: this.listenerSetter,
      contextMenu: {
        buttons: [{
          icon: 'copy',
          text: 'Text.CopyLabel_PhoneNumber',
          onClick: () => {
            simulateClickEvent(this.phone.container);
          }
        }, {
          icon: 'info',
          text: 'PeerInfo.Phone.AnonymousInfo',
          textArgs: [(() => {
            const a = document.createElement('a');
            return a;
          })()],
          onClick: () => {
            safeWindowOpen('https://fragment.com/numbers');
          },
          separator: true,
          secondary: true,
          verify: async() => {
            const {isAnonymous} = await this.managers.appUsersManager.getUserPhone(this.peerId.toUserId()) || {};
            return isAnonymous;
          }
        }]
      }
    });

    this.link = new Row({
      title: ' ',
      subtitleLangKey: 'SetUrlPlaceholder',
      icon: 'link',
      clickable: () => {
        const url = 'https://' + this.link.title.textContent;
        copyTextToClipboard(url);
        // Promise.resolve(appProfileManager.getChatFull(this.peerId.toChatId())).then((chatFull) => {
        // copyTextToClipboard(chatFull.exported_invite.link);
        const isPrivate = url.includes('/c/');
        toast(I18n.format(isPrivate ? 'LinkCopiedPrivateInfo' : 'LinkCopied', true));
        // });
      },
      listenerSetter: this.listenerSetter,
      contextMenu: {
        buttons: [{
          icon: 'copy',
          text: 'Text.CopyLabel_ShareLink',
          onClick: () => {
            simulateClickEvent(this.link.container);
          }
        }]
      }
    });

    this.location = new Row({
      title: ' ',
      subtitleLangKey: 'ChatLocation',
      icon: 'location'
    });

    this.businessHours = createRoot((dispose) => {
      this.middlewareHelper.onDestroy(dispose);
      const [hours, setHours] = createSignal<BusinessWorkHours>();
      const [timezones, setTimezones] = createSignal<Timezone[]>();
      this.setBusinessHours = setHours;
      this.setTimezones = setTimezones;
      return BusinessHours({hours, timezones});
    });

    const copyLocationAddress = () => {
      copyTextToClipboard(this._businessLocation.address);
      toastNew({langPackKey: 'BusinessLocationCopied'});
    };

    this.businessLocation = new Row({
      title: true,
      subtitleLangKey: 'BusinessProfileLocation',
      icon: 'location',
      clickable: async() => {
        const location = this._businessLocation;
        if(!location.geo_point) {
          copyLocationAddress();
          return;
        }

        await confirmationPopup({
          descriptionLangKey: 'Popup.OpenInGoogleMaps',
          button: {
            langKey: 'Open'
          }
        });

        safeWindowOpen(makeGoogleMapsUrl(location.geo_point as GeoPoint.geoPoint));
      },
      contextMenu: {
        buttons: [{
          icon: 'copy',
          text: 'Copy',
          onClick: copyLocationAddress
        }]
      },
      listenerSetter: this.listenerSetter
    });

    this.businessLocation.container.classList.add('business-location');

    this.botVerification = document.createElement('div');
    this.botVerification.classList.add('profile-bot-verification');

    this.section.content.append(
      this.phone.container,
      this.username.container,
      this.location.container,
      this.bio.container,
      this.link.container,
      this.businessHours.container,
      this.businessLocation.container
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

        // let checked = this.notificationsCheckbox.checked;
        this.managers.appMessagesManager.togglePeerMute({peerId: this.peerId, threadId: this.threadId});
      });

      listenerSetter.add(rootScope)('dialog_notify_settings', async(dialog) => {
        if(this.peerId === dialog.peerId) {
          const muted = await this.managers.appNotificationsManager.isPeerLocalMuted({peerId: this.peerId, respectType: false, threadId: this.threadId});
          this.notifications.checkboxField.checked = !muted;
        }
      });

      this.section.content.append(this.notifications.container);
    }

    this.botPermissionsSection = new SettingSection({
      name: i18n('BotAllowAccessTo'),
      noDelimiter: true
    });
    this.botPermissionsEmojiStatus = new Row({
      checkboxField: new CheckboxField({toggle: true}),
      titleLangKey: 'BotAllowAccessToEmojiStatus',
      icon: 'smile',
      listenerSetter: this.listenerSetter
    })
    this.botPermissionsLocation = new Row({
      checkboxField: new CheckboxField({toggle: true}),
      titleLangKey: 'BotAllowAccessToLocation',
      icon: 'location',
      listenerSetter: this.listenerSetter
    })

    listenerSetter.add(this.botPermissionsEmojiStatus.checkboxField.input)('change', (e) => {
      if(!e.isTrusted) {
        return;
      }
      this.managers.appBotsManager.toggleEmojiStatusPermission(this.peerId, this.botPermissionsEmojiStatus.checkboxField.checked);
    });

    listenerSetter.add(this.botPermissionsLocation.checkboxField.input)('change', (e) => {
      if(!e.isTrusted) {
        return;
      }
      this.managers.appBotsManager.writeBotInternalStorage(this.peerId, 'locationPermission', String(this.botPermissionsLocation.checkboxField.checked));
    });

    this.botPermissionsSection.content.append(
      this.botPermissionsEmojiStatus.container,
      this.botPermissionsLocation.container
    );

    this.element.append(
      this.personalChannelSection.container,
      this.section.container,
      this.botVerification,
      this.botPermissionsSection.container,
    );

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

    const n = async({peerId, threadId}: {peerId: PeerId, threadId?: number}) => {
      if(this.peerId !== peerId) {
        return false;
      }

      const isForum = this.peerId.isAnyChat() ? await this.managers.appPeersManager.isForum(this.peerId) : false;
      if(isForum && this.threadId ? this.threadId === threadId : true) {
        return true;
      }

      return false;
    };

    listenerSetter.add(rootScope)('peer_title_edit', async(data) => {
      const middleware = this.middlewareHelper.get();
      if(await n(data)) {
        if(!middleware()) return;
        this.fillUsername().then((callback) => {
          if(!middleware()) return;
          callback?.();
        });
        this.setMoreDetails(true);
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

    listenerSetter.add(rootScope)('avatar_update', async(data) => {
      if(await n(data)) {
        this.setAvatar();
      }
    });

    const refreshCurrentUser = () => {
      if(this.peerId.isUser()) {
        this.managers.appUsersManager.getApiUsers([this.peerId.toUserId()]);
      }
    };

    // * refresh user online status
    listenerSetter.add(rootScope)('premium_toggle', refreshCurrentUser);
    listenerSetter.add(rootScope)('privacy_update', (updatePrivacy) => {
      if(updatePrivacy.key._ === 'privacyKeyStatusTimestamp') {
        refreshCurrentUser();
      }
    });

    this.setPeerStatusInterval = window.setInterval(() => this.setPeerStatus(), 60e3);
  }

  private async setPeerStatus<T extends boolean>(
    needClear = false,
    manual?: T
  ): Promise<T extends true ? () => void : void> {
    const peerId = this.peerId;

    const callbacks: Array<() => void> = [];
    callbacks.push(() => {
      this.element.classList.toggle('is-me', peerId === rootScope.myId);
      if(peerId.isUser()) {
        const user = apiManagerProxy.getUser(peerId.toUserId());
        if((user.status as UserStatus.userStatusRecently)?.pFlags?.by_me) {
          // Don't append the when element if it's already been added
          if(this.subtitle.querySelector('.show-when')) {
            return;
          }

          const when = i18n('StatusHiddenShow');
          when.classList.add('show-when');
          attachClickEvent(when, (e) => {
            cancelEvent(e);
            PopupElement.createPopup(PopupToggleReadDate, peerId, 'lastSeen');
          });
          this.subtitle.append(when);
        }
      }
    });

    let promise: Promise<(() => void) | void> = Promise.resolve();
    if(!(!peerId || (rootScope.myId === peerId && this.isDialog)) && peerId !== HIDDEN_PEER_ID) {
      const isForum = await this.managers.appPeersManager.isForum(this.peerId);
      const middleware = this.middlewareHelper.get();
      if(isForum && this.threadId) {
        promise = wrapTopicNameButton({
          peerId,
          wrapOptions: {
            middleware
          }
        }).then(({element}) => {
          this.subtitle.replaceChildren(element);
        });
      } else {
        promise = appImManager.setPeerStatus({
          peerId,
          element: this.subtitle,
          needClear,
          useWhitespace: true,
          middleware,
          ignoreSelf: !this.isDialog
        });
      }

      promise.then((callback) => callback && callbacks.unshift(callback));
    }

    const callback = () => callbacks.forEach((callback) => callback());

    return promise.then(() => {
      if(manual) {
        return callback;
      }

      callback();
    }) as any;
  }

  public cleanupHTML() {
    [
      this.bio,
      this.phone,
      this.username,
      this.location,
      this.link,
      this.businessHours,
      this.businessLocation,
      this.personalChannelSection,
      this.botPermissionsSection
    ].forEach((row) => {
      row.container.style.display = 'none';
    });

    this.botVerification.style.display = 'none';

    if(this.notifications) {
      this.notifications.container.style.display = '';
      this.notifications.checkboxField.checked = true;
    }

    this.clearSetMoreDetailsTimeout();
  }

  private isSavedDialog() {
    return !!(this.peerId === rootScope.myId && this.threadId);
  }

  private getDetailsForUse() {
    const {peerId, threadId} = this;
    return this.isSavedDialog() ? {
      peerId: threadId,
      threadId: undefined
    } : {
      peerId,
      threadId
    };
  }

  private canBeDetailed() {
    return this.peerId !== rootScope.myId || !this.isDialog;
  }

  private async _setAvatar() {
    const middleware = this.middlewareHelper.get();
    const {peerId, threadId} = this.getDetailsForUse();
    const isTopic = !!(threadId && await this.managers.appPeersManager.isForum(peerId));
    if(/* this.canBeDetailed() &&  */!isTopic) {
      const photo = await this.managers.appPeersManager.getPeerPhoto(peerId);

      if(photo || SHOW_NO_AVATAR) {
        const oldAvatars = this.avatars;
        this.avatars = new PeerProfileAvatars(this.scrollable, this.managers, this.setCollapsedOn);
        await this.avatars.setPeer(peerId);
        const nameCallback = await this.fillName(middleware, this.setCollapsedOn.classList.contains('need-white'));

        return () => {
          nameCallback();

          this.avatars.info.append(this.name, this.subtitle);
          this.avatars.container.append(this.pinnedGiftsContainer);

          if(this.avatar) this.avatar.node.remove();
          this.avatar = undefined;

          if(oldAvatars) oldAvatars.container.replaceWith(this.avatars.container);
          else this.element.prepend(this.avatars.container);

          if(IS_PARALLAX_SUPPORTED) {
            this.scrollable.container.classList.add('parallax');
          }

          this.section.content.classList.remove('has-simple-avatar');
        };
      }
    }

    const avatar = avatarNew({
      middleware,
      size: 120,
      isDialog: this.isDialog,
      peerId,
      threadId: isTopic ? threadId : undefined,
      wrapOptions: {
        customEmojiSize: makeMediaSize(120, 120),
        middleware
      },
      withStories: true,
      meAsNotes: !!(peerId === rootScope.myId && this.threadId)
    });
    avatar.node.classList.add('profile-avatar', 'avatar-120');
    const [nameCallback] = await Promise.all([
      this.fillName(middleware, false),
      avatar.readyThumbPromise
    ]);

    return () => {
      nameCallback();

      if(IS_PARALLAX_SUPPORTED) {
        this.scrollable.container.classList.remove('parallax');
      }

      if(this.avatars) {
        this.avatars.container.remove();
        this.avatars.cleanup();
        this.avatars = undefined;
      }

      if(this.avatar) this.avatar.node.remove();
      this.avatar = avatar;

      this.section.content.classList.add('has-simple-avatar');
      this.section.content.prepend(this.avatar.node, this.name, this.subtitle);
    };
  }

  private setAvatar(manual: true): Promise<() => void>;
  private setAvatar(manual?: false): Promise<void>;

  private setAvatar(manual?: boolean): Promise<(() => void) | void> {
    const promise = this._setAvatar();
    return manual ? promise : promise.then((callback) => callback());
  }

  private getUsernamesAlso(usernames: string[]) {
    const also = usernames.slice(1);
    if(also.length) {
      const a = also.map((username) => anchorCopy({username}));
      const i = i18n('UsernameAlso', [join(a, false)]);
      return i;
    }
  }

  private async fillUsername() {
    const {peerId} = this;
    if(peerId.isUser() && this.canBeDetailed()) {
      const usernames = await this.managers.appPeersManager.getPeerActiveUsernames(peerId);
      const also = this.getUsernamesAlso(usernames);

      return () => {
        this.username.subtitle.replaceChildren(also || i18n('Username'));
        setText(usernames[0], this.username);
      };
    }
  }

  private async fillUserPhone() {
    const {peerId} = this;
    if(peerId.isUser() && this.canBeDetailed()) {
      const {phone, isAnonymous} = await this.managers.appUsersManager.getUserPhone(peerId.toUserId()) || {};

      return () => {
        this.phone.subtitle.replaceChildren(i18n(isAnonymous ? 'AnonymousNumber' : 'Phone'));
        setText(phone ? formatUserPhone(phone) : undefined, this.phone);
      };
    }
  }

  private async fillNotifications() {
    const notificationsRow = this.notifications;
    if(!notificationsRow) {
      return;
    }

    if(this.canBeDetailed()) {
      const muted = await this.managers.appNotificationsManager.isPeerLocalMuted({peerId: this.peerId, respectType: false, threadId: this.threadId});
      return () => {
        notificationsRow.checkboxField.checked = !muted;
      };
    } else {
      return () => {
        // fastRaf(() => {
        notificationsRow.container.style.display = 'none';
        // });
      };
    }
  }

  private async fillName(middleware: Middleware, white?: boolean) {
    const {peerId} = this.getDetailsForUse();
    const [element/* , icons */] = await Promise.all([
      wrapPeerTitle({
        peerId,
        dialog: this.isDialog,
        withIcons: !this.threadId,
        threadId: this.threadId,
        wrapOptions: {
          middleware,
          textColor: white ? 'white' : undefined
        },
        meAsNotes: !!(peerId === rootScope.myId && this.threadId)
      })

      // generateTitleIcons(peerId)
    ]);

    return () => {
      replaceContent(this.name, element);
      // this.name.append(...icons);
    };
  }

  private async fillRows(manual: Promise<any>) {
    return Promise.all([
      this.fillUsername(),
      this.fillUserPhone(),
      this.fillNotifications(),
      this.setMoreDetails(undefined, manual),
      this.setPeerStatus(true, true)
    ].map((promise) => promise.catch(() => undefined as () => void))).then((callbacks) => {
      return () => {
        callbacks.forEach((callback) => callback?.());
      };
    });
  }

  private async fillPinnedGifts() {
    const {peerId} = this.getDetailsForUse();
    if(!peerId.isUser()) return;

    const pinnedGifts = await this.managers.appGiftsManager.getPinnedGifts(peerId);
    const middleware = this.middlewareHelper.get();
    const stickers = await Promise.all(pinnedGifts.filter((it) => it.saved.pFlags.pinned_to_top).map(async(gift, idx) => {
      const div = document.createElement('div');
      div.className = 'profile-pinned-gift';
      div.setAttribute('data-idx', idx.toString());
      div.style.setProperty('--halo-color', rgbIntToHex(gift.collectibleAttributes.backdrop.center_color));
      await wrapSticker({
        doc: gift.sticker,
        static: true,
        middleware,
        width: 30,
        height: 30,
        div
      }).then((r) => r.render);
      return div;
    }));
    this.onPinnedGiftsChange?.(pinnedGifts);

    return () => {
      this.pinnedGiftsContainer.replaceChildren(...stickers);
    };
  }

  public async fillProfileElements() {
    if(!this.cleaned) return;
    this.cleaned = false;

    this.cleanupHTML();
    const deferred = deferredPromise<void>();
    const middleware = this.middlewareHelper.get();
    middleware.onClean(() => {
      deferred.reject();
    });

    const callbacks = await Promise.all([
      this.setAvatar(true),
      this.fillRows(deferred)
    ]);

    return () => {
      deferred.resolve();
      callbacks.forEach((callback) => callback?.());
    };
  }

  private async _setMoreDetails(
    peerId: PeerId,
    peerFull: ChatFull | UserFull,
    appConfig: MTAppConfig,
    timezones: Timezone[]
  ) {
    const middleware = this.middlewareHelper.get().create().get();
    const m = this.getMiddlewarePromise();
    const isTopic = !!(this.threadId && await m(this.managers.appPeersManager.isForum(peerId)));
    const isPremium = peerId.isUser() ? await m(this.managers.appUsersManager.isPremium(peerId.toUserId())) : undefined;
    if(isTopic) {
      let url = 't.me/';
      const threadId = getServerMessageId(this.threadId);
      const username = await m(this.managers.appPeersManager.getPeerUsername(peerId));
      if(username) {
        url += `${username}/${threadId}`;
      } else {
        url += `c/${peerId.toChatId()}/${threadId}`;
      }

      return () => {
        setText(url, this.link);
      };
    }

    const callbacks: (() => void)[] = [];
    // if(peerFull.about) {
    callbacks.push(() => {
      this.bio.subtitle.replaceChildren(i18n(peerId.isUser() ? 'UserBio' : 'Info'));
      setText(peerFull.about ? wrapRichText(peerFull.about, {
        whitelistedDomains: isPremium ? undefined : appConfig.whitelisted_domains
      }) : undefined, this.bio);
      this.bioLanguage = detectLanguageForTranslation(this.bioText = peerFull.about);
    });
    // }

    if(!peerId.isUser()) {
      const chat = await m(this.managers.appChatsManager.getChat(peerId.toChatId())) as Chat.channel;
      const usernames = getPeerActiveUsernames(chat);
      let also: HTMLElement;
      if(usernames.length) {
        also = this.getUsernamesAlso(usernames);
        callbacks.push(() => setText('t.me/' + usernames[0], this.link));
      } else {
        const exportedInvite = (peerFull as ChatFull.channelFull).exported_invite;
        if(exportedInvite?._ === 'chatInviteExported') {
          callbacks.push(() => setText(exportedInvite.link.slice(exportedInvite.link.indexOf('t.me/')), this.link));
        }
      }

      callbacks.push(() => this.link.subtitle.replaceChildren(also || i18n('SetUrlPlaceholder')));
    }

    const location = (peerFull as ChatFull.channelFull).location;
    if(location?._ == 'channelLocation') {
      callbacks.push(() => setText(location.address, this.location));
    }

    const workHours = (peerFull as UserFull).business_work_hours;
    if(workHours) {
      batch(() => {
        this.setBusinessHours(workHours);
        this.setTimezones(timezones);
      });
    }

    callbacks.push(() => {
      this.businessHours.container.style.display = workHours ? '' : 'none';
    });

    const businessLocation = (peerFull as UserFull).business_location;
    this._businessLocation = businessLocation;
    if(businessLocation) {
      const geo = businessLocation.geo_point as GeoPoint.geoPoint;
      callbacks.push(() => {
        setText(wrapEmojiText(businessLocation.address), this.businessLocation);
        if(!geo) {
          this.businessLocation.media?.remove();
        }
      });

      if(geo) {
        const media = this.businessLocation.createMedia('big');
        media.remove();
        const loadPromises: Promise<any>[] = [];
        wrapPhoto({
          photo: getWebFileLocation(geo, 48, 48, 16),
          container: media,
          middleware,
          onRender: () => {
            if(!middleware() || this._businessLocation !== businessLocation) {
              return;
            }

            this.businessLocation.container.append(media);
          },
          loadPromises
        });

        await Promise.all(loadPromises);
      }
    }

    callbacks.push(() => {
      this.businessLocation.container.style.display = businessLocation ? '' : 'none';
    });

    const personalChannelId = (peerFull as UserFull).personal_channel_id;
    if(personalChannelId) {
      const peerId = personalChannelId.toPeerId(true);
      const mid = (peerFull as UserFull).personal_channel_message;
      const chat = apiManagerProxy.getChat(personalChannelId) as Chat.channel;

      const loadPromises: Promise<any>[] = [];
      const list = appDialogsManager.createChatList();
      const dialogElement = appDialogsManager.addDialogNew({
        peerId: peerId,
        container: list,
        rippleEnabled: true,
        avatarSize: 'abitbigger',
        append: true,
        wrapOptions: {middleware},
        withStories: true,
        loadPromises
      });

      dialogElement.container.classList.add('personal-channel');

      const makeSkeleton = (props: {
        element: HTMLElement,
        middleware: Middleware
      }) => {
        const [children, setChildren] = createSignal<JSX.Element>();
        const dispose = render(() => {
          return Skeleton({
            children,
            loading: createMemo(() => !children())
          });
        }, props.element);

        props.element.classList.add('skeleton-container');
        props.middleware.onDestroy(dispose);

        return setChildren;
      };

      const TEST = false;
      const isCached = !!apiManagerProxy.getMessageByPeer(peerId, mid) && !TEST;
      const messagePromise = this.managers.appMessagesManager.reloadMessages(peerId, mid);
      const readyPromise = messagePromise.then(async(message) => {
        TEST && await pause(1000);
        await appDialogsManager.setLastMessageN({
          dialog: {
            _: 'dialog',
            peerId
          } as any,
          lastMessage: message,
          dialogElement
        });

        setSubtitleChildren?.(dialogElement.subtitle);
        setTimeChildren?.(dialogElement.dom.lastTimeSpan);
      });

      let setSubtitleChildren: (children: JSX.Element) => void, setTimeChildren: (children: JSX.Element) => void;
      if(!isCached) {
        const _subtitle = dialogElement.subtitle.cloneNode(true) as HTMLElement;
        dialogElement.subtitle.replaceWith(_subtitle);
        setSubtitleChildren = makeSkeleton({
          element: _subtitle,
          middleware
        });

        const timeSpan = dialogElement.dom.lastTimeSpan.cloneNode(true) as HTMLElement;
        dialogElement.dom.lastTimeSpan.replaceWith(timeSpan);
        setTimeChildren = makeSkeleton({
          element: timeSpan,
          middleware
        });
      }

      if(isCached) {
        loadPromises.push(readyPromise);
      }

      callbacks.push(() => {
        this.personalChannelCounter.replaceChildren(i18n('Subscribers', [numberThousandSplitter(chat.participants_count)]));
        const oldList = this.personalChannelSection.content.querySelector('.chatlist');
        oldList?.remove();
        this.personalChannelSection.content.append(list);
      });

      await Promise.all(loadPromises);
    }

    callbacks.push(() => {
      this.personalChannelSection.container.style.display = personalChannelId ? '' : 'none';
      this.onPersonalChannel?.(!!personalChannelId);
    });

    this.setMoreDetailsTimeout = window.setTimeout(() => this.setMoreDetails(true), 60e3);

    if((peerFull._ === 'userFull' || peerFull._ === 'channelFull') && peerFull.stargifts_count > 0) {
      callbacks.push(() => m(this.fillPinnedGifts()).then(clb => clb?.()));
    }

    if(peerFull._ === 'userFull' && peerFull.bot_info) {
      const locationPermission = await m(this.managers.appBotsManager.readBotInternalStorage(peerId, 'locationPermission'));
      if(peerFull.pFlags.bot_can_manage_emoji_status || locationPermission != null) {
        callbacks.push(() => {
          this.botPermissionsSection.container.style.display = '';

          this.botPermissionsEmojiStatus.container.style.display = peerFull.pFlags.bot_can_manage_emoji_status ? '' : 'none';
          this.botPermissionsEmojiStatus.checkboxField.checked = peerFull.pFlags.bot_can_manage_emoji_status;

          this.botPermissionsLocation.container.style.display = locationPermission != null ? '' : 'none';
          this.botPermissionsLocation.checkboxField.checked = locationPermission === 'true';
        });
      }
    }

    if((peerFull._ === 'userFull' || peerFull._ === 'channelFull') && peerFull.bot_verification) {
      callbacks.push(() => {
        this.botVerification.style.display = '';

        const content = document.createElement('div');
        content.classList.add('profile-bot-verification-content');
        content.append(wrapRichText(peerFull.bot_verification.description));

        this.botVerification.replaceChildren(
          wrapAdaptiveCustomEmoji({
            docId: peerFull.bot_verification.icon,
            size: 32,
            wrapOptions: {
              middleware,
              textColor: 'secondary-text-color'
            }
          }).container,
          content
        );
      })
    }

    return () => {
      callbacks.forEach((callback) => callback?.());
    };
  }

  private async setMoreDetails(override?: true, manual?: Promise<any>) {
    this.clearSetMoreDetailsTimeout();

    const {peerId} = this;
    const m = this.getMiddlewarePromise();

    if(!peerId || !this.canBeDetailed() || await m(this.managers.appPeersManager.isPeerRestricted(peerId))) {
      return;
    }

    const results = await m(Promise.all([
      this.managers.acknowledged.appProfileManager.getProfileByPeerId(peerId, override),
      this.managers.acknowledged.apiManager.getAppConfig(),
      this.managers.acknowledged.apiManager.getTimezonesList()
    ]));
    const promises = results.map((result) => result.result) as [Promise<ChatFull | UserFull.userFull>, Promise<MTAppConfig>, Promise<HelpTimezonesList.helpTimezonesList>];
    const setPromise = m(Promise.all(promises)).then(async([peerFull, appConfig, timezonesList]) => {
      if(await m(this.managers.appPeersManager.isPeerRestricted(peerId))) {
        // this.log.warn('peer changed');
        return;
      }

      return m(this._setMoreDetails(peerId, peerFull, appConfig, timezonesList.timezones));
    });

    if(results.every((result) => result.cached) && manual) {
      return setPromise;
    } else {
      (manual || Promise.resolve())
      .then(() => setPromise)
      .then((callback) => {
        callback?.();
      });
    }
  }

  private getMiddlewarePromise() {
    return middlewarePromise(this.middlewareHelper.get(), makeError('MIDDLEWARE'));
  }

  public setPeer(peerId: PeerId, threadId?: number) {
    if(this.peerId === peerId && this.threadId === threadId) return;

    this.init?.();

    this.peerId = peerId;
    this.threadId = threadId;

    this.middlewareHelper.clean();
    this.cleaned = true;
  }

  public clearSetMoreDetailsTimeout() {
    if(this.setMoreDetailsTimeout !== undefined) {
      clearTimeout(this.setMoreDetailsTimeout);
      this.setMoreDetailsTimeout = undefined;
    }
  }

  public destroy() {
    this.peerId = this.threadId = undefined;
    this.clearSetMoreDetailsTimeout();
    clearInterval(this.setPeerStatusInterval);
    this.avatars?.cleanup();
    this.middlewareHelper.destroy();
  }
}
