/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SliderSuperTab } from "../../slider";
import ButtonMenuToggle from "../../buttonMenuToggle";
import Button from "../../button";
import AppPrivacyAndSecurityTab from "./privacyAndSecurity";
import AppGeneralSettingsTab from "./generalSettings";
import AppEditProfileTab from "./editProfile";
import AppChatFoldersTab from "./chatFolders";
import AppNotificationsTab from "./notifications";
import AppLanguageTab from "./language";
import lottieLoader from "../../../lib/rlottie/lottieLoader";
import PopupPeer from "../../popups/peer";
import AppDataAndStorageTab from "./dataAndStorage";
import ButtonIcon from "../../buttonIcon";
import PeerProfile from "../../peerProfile";
import rootScope from "../../../lib/rootScope";
import { SettingSection } from "..";
import Row from "../../row";
import AppActiveSessionsTab from "./activeSessions";
import { i18n, LangPackKey } from "../../../lib/langPack";
import { SliderSuperTabConstructable } from "../../sliderTab";
import PopupAvatar from "../../popups/avatar";
import { AccountAuthorizations, Authorization } from "../../../layer";
import PopupElement from "../../popups";
import { attachClickEvent } from "../../../helpers/dom/clickEvent";
//import AppMediaViewer from "../../appMediaViewerNew";

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

  protected async init() {
    this.container.classList.add('settings-container');
    this.setTitle('Settings');
    
    const btnMenu = ButtonMenuToggle({listenerSetter: this.listenerSetter}, 'bottom-left', [{
      icon: 'logout',
      text: 'EditAccount.Logout',
      onClick: () => {
        new PopupPeer('logout', {
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
    }]);

    this.buttons.edit = ButtonIcon('edit');

    this.header.append(this.buttons.edit, btnMenu);

    this.profile = new PeerProfile(this.managers, this.scrollable, this.listenerSetter, false);
    this.profile.init();
    this.profile.setPeer(rootScope.myId);
    const fillPromise = this.profile.fillProfileElements();

    const changeAvatarBtn = Button('btn-circle btn-corner z-depth-1 profile-change-avatar', {icon: 'cameraadd'});
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
    this.listenerSetter.add(rootScope)('avatar_update', (peerId) => {
      if(rootScope.myId === peerId) {
        updateChangeAvatarBtn();
      }
    });

    /* const div = document.createElement('div');
    //div.style.cssText = 'border-radius: 8px; overflow: hidden; width: 396px; height: 264px; flex: 0 0 auto; position: relative; margin: 10rem 0 10rem auto;';
    //div.style.width = '135px';
    //div.style.height = '100px';
    div.style.cssText = 'border-radius: 8px; overflow: hidden; width: 396px; height: 264px; flex: 0 0 auto; position: relative; margin: 10rem auto 10rem 0;';
    div.style.width = '135px';
    div.style.height = '100px';
    
    const img = document.createElement('img');
    img.src = 'assets/img/pepe.jpg';
    img.classList.add('media-photo');
    img.style.cssText = 'max-width: 100%;max-height: 100%;';

    div.append(img);

    div.addEventListener('click', () => {
      new AppMediaViewer().setSearchContext({peerId: 61004386, inputFilter: 'inputMessagesFilterPhotos'}).openMedia({
        _: 'message',
        mid: 1,
        peerId: 61004386,
        fromId: 61004386,
        message: '',
        media: {
          _: 'messageMediaPhoto',
          photo: {
            _: 'photo',
            url: img.src,
            downloaded: 111,
            sizes: [{
              _: 'photoSize',
              type: 'x',
              w: 618,
              h: 412
            }]
          }
        },
        date: Date.now() / 1000 | 0
      }, img);
    });

    this.scrollable.append(div); */
    
    const buttonsDiv = document.createElement('div');
    buttonsDiv.classList.add('profile-buttons');

    const b: [string, LangPackKey, SliderSuperTabConstructable][] = [
      ['unmute', 'AccountSettings.Notifications', AppNotificationsTab],
      ['data', 'DataSettings', AppDataAndStorageTab],
      ['lock', 'AccountSettings.PrivacyAndSecurity', AppPrivacyAndSecurityTab],
      ['settings', 'Telegram.GeneralSettingsViewController', AppGeneralSettingsTab],
      ['folder', 'AccountSettings.Filters', AppChatFoldersTab],
    ];

    const rows = b.map(([icon, langPackKey, tabConstructor]) => {
      return new Row({
        titleLangKey: langPackKey,
        icon,
        clickable: () => {
          this.slider.createTab(tabConstructor).open();
          // new tabConstructor(this.slider, true).open();
        },
        listenerSetter: this.listenerSetter
      });
    });

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
          this.slider.createTab(AppLanguageTab).open();
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

    attachClickEvent(this.buttons.edit, () => {
      const tab = this.slider.createTab(AppEditProfileTab);
      tab.open();
    }, {listenerSetter: this.listenerSetter});

    lottieLoader.loadLottieWorkers();

    this.updateActiveSessions();

    await fillPromise;
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
