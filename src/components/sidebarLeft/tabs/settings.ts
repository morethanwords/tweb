/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {SliderSuperTab} from '../../slider';
import ButtonMenuToggle from '../../buttonMenuToggle';
import Button from '../../button';
import AppPrivacyAndSecurityTab from './privacyAndSecurity';
import AppGeneralSettingsTab from './generalSettings';
import AppEditProfileTab from './editProfile';
import AppChatFoldersTab from './chatFolders';
import AppNotificationsTab from './notifications';
import AppLanguageTab from './language';
import lottieLoader from '../../../lib/rlottie/lottieLoader';
import PopupPeer from '../../popups/peer';
import AppDataAndStorageTab from './dataAndStorage';
import ButtonIcon from '../../buttonIcon';
import PeerProfile from '../../peerProfile';
import rootScope from '../../../lib/rootScope';
import Row from '../../row';
import AppActiveSessionsTab from './activeSessions';
import {i18n, LangPackKey} from '../../../lib/langPack';
import {SliderSuperTabConstructable, SliderSuperTabEventable} from '../../sliderTab';
import PopupAvatar from '../../popups/avatar';
import {AccountAuthorizations, Authorization} from '../../../layer';
import PopupElement from '../../popups';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import SettingSection from '../../settingSection';
import AppStickersAndEmojiTab from './stickersAndEmoji';
import ButtonCorner from '../../buttonCorner';

export default class AppSettingsTab extends SliderSuperTab {
  private buttons: {
    edit: HTMLButtonElement,
    folders: HTMLButtonElement,
    general: HTMLButtonElement,
    notifications: HTMLButtonElement,
    storage: HTMLButtonElement,
    privacy: HTMLButtonElement,
  } = {} as any;
  private profile: PeerProfile;

  private languageRow: Row;
  private devicesRow: Row;

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
        onClick: () => {
          PopupElement.createPopup(PopupPeer, 'logout', {
            titleLangKey: 'LogOut',
            descriptionLangKey: 'LogOut.Description',
            buttons: [{
              langKey: 'LogOut',
              callback: () => {
                this.managers.apiManager.logOut();
              },
              isDanger: true
            }]
          }).show();
        }
      }]
    });

    this.buttons.edit = ButtonIcon('edit');

    this.header.append(this.buttons.edit, btnMenu);

    this.profile = new PeerProfile(this.managers, this.scrollable, this.listenerSetter, false);
    this.profile.init();
    this.profile.setPeer(rootScope.myId);
    const fillPromise = this.profile.fillProfileElements();

    const changeAvatarBtn = ButtonCorner({icon: 'cameraadd', className: 'profile-change-avatar'});
    attachClickEvent(changeAvatarBtn, () => {
      const canvas = document.createElement('canvas');
      PopupElement.createPopup(PopupAvatar).open(canvas, (upload) => {
        upload().then((inputFile) => {
          return this.managers.appProfileManager.uploadProfilePhoto(inputFile);
        });
      });
    }, {listenerSetter: this.listenerSetter});
    this.profile.element.lastElementChild.firstElementChild.append(changeAvatarBtn);

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
      icon: string,
      text: LangPackKey,
      c: T,
      getInitArgs?: () => Promise<Parameters<ConstructorP<T>['init']>>
    ): {
      icon: string,
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

    const buttonsSection = new SettingSection();
    buttonsSection.content.append(buttonsDiv);

    this.scrollable.append(this.profile.element/* profileSection.container */, buttonsSection.container);

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

    (await fillPromise)();
  }

  private getAuthorizations(overwrite?: boolean) {
    if(this.getAuthorizationsPromise && !overwrite) return this.getAuthorizationsPromise;

    const promise = this.getAuthorizationsPromise = this.managers.apiManager.invokeApi('account.getAuthorizations')
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

  public onCloseAfterTimeout() {
    this.profile.destroy();
    return super.onCloseAfterTimeout();
  }
}
