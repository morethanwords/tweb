/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {SliderSuperTab} from '@components/slider';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import AppPrivacyAndSecurityTab from '@components/sidebarLeft/tabs/privacyAndSecurity';
import AppGeneralSettingsTab from '@components/sidebarLeft/tabs/generalSettings';
import AppEditProfileTab from '@components/sidebarLeft/tabs/editProfile';
import AppChatFoldersTab from '@components/sidebarLeft/tabs/chatFolders';
import {AppNotificationsTab} from '@components/solidJsTabs';
import AppLanguageTab from '@components/sidebarLeft/tabs/language';
import lottieLoader from '@lib/rlottie/lottieLoader';
import PopupPeer from '@components/popups/peer';
import AppDataAndStorageTab from '@components/sidebarLeft/tabs/dataAndStorage';
import ButtonIcon from '@components/buttonIcon';
import rootScope from '@lib/rootScope';
import Row from '@components/row';
import AppActiveSessionsTab from '@components/sidebarLeft/tabs/activeSessions';
import {i18n, LangPackKey} from '@lib/langPack';
import {SliderSuperTabConstructable, SliderSuperTabEventable} from '@components/sliderTab';
import PopupAvatar from '@components/popups/avatar';
import {AccountAuthorizations, Authorization} from '@layer';
import PopupElement from '@components/popups';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import SettingSection from '@components/settingSection';
import AppStickersAndEmojiTab from '@components/sidebarLeft/tabs/stickersAndEmoji';
import ButtonCorner from '@components/buttonCorner';
import PopupPremium from '@components/popups/premium';
import appImManager from '@lib/appImManager';
import apiManagerProxy from '@lib/apiManagerProxy';
import {createEffect, createRoot} from 'solid-js';
import useStars from '@stores/stars';
import PopupStars from '@components/popups/stars';
import {renderPeerProfile} from '@components/peerProfile';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import PopupPickUser from '@components/popups/pickUser';
import PopupSendGift from '@components/popups/sendGift';
import {formatNanoton} from '@helpers/paymentsWrapCurrencyAmount';
import showLogOutPopup from '@components/popups/logOut';

export default class AppSettingsTab extends SliderSuperTab {
  private buttons: {
    edit: HTMLButtonElement,
    folders: HTMLButtonElement,
    general: HTMLButtonElement,
    notifications: HTMLButtonElement,
    storage: HTMLButtonElement,
    privacy: HTMLButtonElement,
  } = {} as any;

  private languageRow: Row;
  private devicesRow: Row;
  private premiumRow: Row;

  private authorizations: Authorization.authorization[];
  private getAuthorizationsPromise: Promise<AccountAuthorizations.accountAuthorizations>;

  public async init() {
    this.container.classList.add('settings-container');
    this.setTitle('Settings');

    const btnMenu = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      direction: 'bottom-left',
      buttons: [{
        icon: 'logout',
        text: 'EditAccount.Logout',
        onClick: () => showLogOutPopup()
      }]
    });

    this.buttons.edit = ButtonIcon('edit');

    this.header.append(this.buttons.edit, btnMenu);

    const changeAvatarBtn = ButtonCorner({icon: 'cameraadd', className: 'profile-change-avatar'});
    attachClickEvent(changeAvatarBtn, () => {
      const canvas = document.createElement('canvas');
      PopupElement.createPopup(PopupAvatar).open(canvas, (upload) => {
        upload().then((inputFile) => {
          return this.managers.appProfileManager.uploadProfilePhoto(inputFile);
        });
      });
    }, {listenerSetter: this.listenerSetter});

    const peerProfileElement = createRoot((dispose) => {
      this.middlewareHelper.onDestroy(dispose);
      return renderPeerProfile({
        peerId: rootScope.myId,
        isDialog: false,
        scrollable: this.scrollable,
        setCollapsedOn: this.container,
        changeAvatarBtn
      }, SolidJSHotReloadGuardProvider);
    });

    const updateChangeAvatarBtn = async() => {
      const user = await this.managers.appUsersManager.getSelf();
      changeAvatarBtn.classList.toggle('hide', user.photo?._ !== 'userProfilePhoto');
    };

    updateChangeAvatarBtn();
    this.listenerSetter.add(rootScope)('avatar_update', ({peerId}) => {
      if(rootScope.myId === peerId) {
        updateChangeAvatarBtn();
      }
    });

    const buttonsDiv = document.createElement('div');
    buttonsDiv.classList.add('profile-buttons');

    type ConstructorP<T> = T extends {
      new (...args: any[]): infer U;
    } ? U : never;

    const m = <T extends SliderSuperTabConstructable>(
      icon: Icon,
      text: LangPackKey,
      c: T,
      getInitArgs?: () => Promise<Parameters<ConstructorP<T>['init']>>
    ): {
      icon: Icon,
      text: LangPackKey,
      tabConstructor: T,
      getInitArgs?: typeof getInitArgs,
      // args?: ReturnType<typeof getInitArgs>
      args?: any
    } => {
      if(!getInitArgs) {
        const g = (c as any as typeof SliderSuperTab).getInitArgs;
        if(g) {
          // @ts-ignore
          getInitArgs = () => [g(this)];
        }
      }

      return {
        icon,
        text,
        tabConstructor: c,
        getInitArgs,
        args: getInitArgs?.()
      };
    };

    // const k = <T extends SliderSuperTabConstructable>(c: T): () => [ReturnType<ConstructorP<T>['getInitArgs']>] => {
    //   return () => (c as any).getInitArgs(this);
    // };

    const b = [
      m('unmute', 'AccountSettings.Notifications', AppNotificationsTab),
      m('data', 'DataSettings', AppDataAndStorageTab),
      m('lock', 'AccountSettings.PrivacyAndSecurity', AppPrivacyAndSecurityTab),
      m('settings', 'Telegram.GeneralSettingsViewController', AppGeneralSettingsTab),
      m('folder', 'AccountSettings.Filters', AppChatFoldersTab),
      m('stickers_face', 'StickersName', AppStickersAndEmojiTab)
    ];

    const rows = b.map((item) => {
      const {icon, text: langPackKey, tabConstructor, getInitArgs} = item;
      return new Row({
        titleLangKey: langPackKey,
        icon,
        clickable: async() => {
          const args = item.args ? await item.args : [];
          const tab = this.slider.createTab(tabConstructor as any);
          tab.open(...args);

          if(tab instanceof SliderSuperTabEventable && getInitArgs) {
            (tab as SliderSuperTabEventable).eventListener.addEventListener('destroyAfter', (promise) => {
              item.args = promise.then(() => getInitArgs() as any);
            });
          }
        },
        listenerSetter: this.listenerSetter
      });
    });

    const languageArgs = AppLanguageTab.getInitArgs();
    rows.push(
      this.devicesRow = new Row({
        titleLangKey: 'Devices',
        titleRightSecondary: ' ',
        icon: 'activesessions',
        clickable: async() => {
          if(!this.authorizations) {
            await this.updateActiveSessions();
          }

          const tab = this.slider.createTab(AppActiveSessionsTab);
          tab.authorizations = this.authorizations;
          tab.eventListener.addEventListener('destroy', () => {
            this.authorizations = undefined;
            this.updateActiveSessions(true);
          }, {once: true});
          tab.open();
        },
        listenerSetter: this.listenerSetter
      }),
      this.languageRow = new Row({
        titleLangKey: 'AccountSettings.Language',
        titleRightSecondary: i18n('LanguageName'),
        icon: 'language',
        clickable: () => {
          this.slider.createTab(AppLanguageTab).open(languageArgs);
        },
        listenerSetter: this.listenerSetter
      })
    );

    buttonsDiv.append(...rows.map((row) => row.container));

    // const profileSection = new SettingSection({fullWidth: true, noPaddingTop: true});
    // profileSection.content.append(this.profile.element);

    this.premiumRow = new Row({
      titleLangKey: 'Premium.Boarding.Title',
      icon: 'star',
      iconClasses: ['row-icon-premium-color'],
      clickable: () => {
        PopupPremium.show();
      },
      listenerSetter: this.listenerSetter
    });

    const starsRow = new Row({
      titleLangKey: 'MenuTelegramStars',
      titleRightSecondary: true,
      icon: 'star',
      iconClasses: ['row-icon-stars-color'],
      clickable: () => {
        PopupElement.createPopup(PopupStars);
      },
      listenerSetter: this.listenerSetter
    });

    const starsTonRow = new Row({
      titleLangKey: 'MenuTelegramStarsTon',
      titleRightSecondary: true,
      icon: 'ton',
      clickable: () => {
        PopupElement.createPopup(PopupStars, {ton: true});
      },
      listenerSetter: this.listenerSetter
    });

    createRoot((dispose) => {
      this.middlewareHelper.onDestroy(dispose);
      const stars = useStars();
      const starsTon = useStars(true);
      createEffect(() => {
        starsRow.titleRight.textContent = '' + stars();
        starsRow.container.classList.toggle('hide', !stars());
      });
      createEffect(() => {
        starsTonRow.titleRight.textContent = formatNanoton(starsTon());
        starsTonRow.container.classList.toggle('hide', String(starsTon()) === '0');
      });
    });

    const giftPremium = new Row({
      titleLangKey: 'Chat.Menu.SendGift',
      icon: 'gift',
      clickable: () => {
        PopupElement.createPopup(PopupPickUser, {
          placeholder: 'Chat.Menu.SendGift',
          selfPresence: 'SendGiftSelfCaption',
          meAsSaved: false,
          onSelect: (peerId) => {
            PopupElement.createPopup(PopupSendGift, {peerId});
          },
          filterPeerTypeBy: ['isRegularUser', 'isBroadcast']
        });
      },
      listenerSetter: this.listenerSetter
    });

    const buttonsSection = new SettingSection();
    buttonsSection.content.append(buttonsDiv);

    let premiumSection: SettingSection;
    if(!await apiManagerProxy.isPremiumPurchaseBlocked()) {
      premiumSection = new SettingSection();
      premiumSection.content.append(
        this.premiumRow.container,
        starsRow.container,
        starsTonRow.container,
        giftPremium.container
      );
    }

    this.scrollable.append(...[
      peerProfileElement,
      /* profileSection.container, */
      buttonsSection.container,
      premiumSection?.container
    ].filter(Boolean));

    const getEditProfileArgs = () => {
      editProfileArgs = AppEditProfileTab.getInitArgs();
    };
    let editProfileArgs: ReturnType<typeof AppEditProfileTab['getInitArgs']>;
    attachClickEvent(this.buttons.edit, () => {
      const tab = this.slider.createTab(AppEditProfileTab);
      tab.open(editProfileArgs);
    }, {listenerSetter: this.listenerSetter});
    getEditProfileArgs();
    // this.listenerSetter.add(rootScope)('user_full_update', (userId) => {
    //   if(rootScope.myId.toUserId() === userId) {
    //     getEditProfileArgs();
    //   }
    // });
    this.listenerSetter.add(rootScope)('user_update', (userId) => {
      if(rootScope.myId.toUserId() === userId) {
        getEditProfileArgs();
      }
    });

    lottieLoader.loadLottieWorkers();

    this.updateActiveSessions();
  }

  private getAuthorizations(overwrite?: boolean) {
    if(this.getAuthorizationsPromise && !overwrite) return this.getAuthorizationsPromise;

    const promise = this.getAuthorizationsPromise = this.managers.appAccountManager.getAuthorizations()
    .finally(() => {
      if(this.getAuthorizationsPromise === promise) {
        this.getAuthorizationsPromise = undefined;
      }
    });

    return promise;
  }

  public updateActiveSessions(overwrite?: boolean) {
    return this.getAuthorizations(overwrite).then((auths) => {
      this.authorizations = auths.authorizations;
      this.devicesRow.titleRight.textContent = '' + this.authorizations.length;
    });
  }
}
