import { SliderSuperTab } from "../../slider";
import AvatarElement from "../../avatar";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import ButtonMenuToggle from "../../buttonMenuToggle";
import Button from "../../button";
import AppPrivacyAndSecurityTab from "./privacyAndSecurity";
import AppGeneralSettingsTab from "./generalSettings";
import AppEditProfileTab from "./editProfile";
import AppChatFoldersTab from "./chatFolders";
import AppNotificationsTab from "./notifications";
//import AppMediaViewer from "../../appMediaViewerNew";

export default class AppSettingsTab extends SliderSuperTab {
  private avatarElem: AvatarElement;
  private nameDiv: HTMLElement;
  private phoneDiv: HTMLElement;

  private buttons: {
    edit: HTMLButtonElement,
    folders: HTMLButtonElement,
    general: HTMLButtonElement,
    notifications: HTMLButtonElement,
    privacy: HTMLButtonElement,
    language: HTMLButtonElement
  } = {} as any;

  init() {
    this.container.classList.add('settings-container');
    this.title.innerText = 'Settings';
    
    const btnMenu = ButtonMenuToggle({}, 'bottom-left', [{
      icon: 'logout',
      text: 'Log Out',
      onClick: () => {
        apiManager.logOut();
      }
    }]);

    this.header.append(btnMenu);

    this.avatarElem = new AvatarElement();
    this.avatarElem.setAttribute('clickable', '');
    this.avatarElem.classList.add('profile-avatar', 'avatar-120');

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
    
    this.nameDiv = document.createElement('div');
    this.nameDiv.classList.add('profile-name');

    this.phoneDiv = document.createElement('div');
    this.phoneDiv.classList.add('profile-subtitle');

    const buttonsDiv = document.createElement('div');
    buttonsDiv.classList.add('profile-buttons');

    const className = 'profile-button btn-primary btn-transparent';
    buttonsDiv.append(this.buttons.edit = Button(className, {icon: 'edit', text: 'Edit Profile'}));
    buttonsDiv.append(this.buttons.folders = Button(className, {icon: 'folder', text: 'Chat Folders'}));
    buttonsDiv.append(this.buttons.general = Button(className, {icon: 'settings', text: 'General Settings'}));
    buttonsDiv.append(this.buttons.notifications = Button(className, {icon: 'unmute', text: 'Notifications'}));
    buttonsDiv.append(this.buttons.privacy = Button(className, {icon: 'lock', text: 'Privacy and Security'}));
    buttonsDiv.append(this.buttons.language = Button(className, {icon: 'language', text: 'Language', disabled: true}));
    
    this.scrollable.append(this.avatarElem, this.nameDiv, this.phoneDiv, buttonsDiv);
    this.scrollable.container.classList.add('profile-content-wrapper');

    /* rootScope.$on('user_auth', (e) => {
      this.fillElements();
    }); */

    this.buttons.edit.addEventListener('click', () => {
      const tab = new AppEditProfileTab(this.slider);
      tab.fillElements();
      tab.open();
    });

    this.buttons.folders.addEventListener('click', () => {
      new AppChatFoldersTab(this.slider).open();
    });

    this.buttons.general.addEventListener('click', () => {
      new AppGeneralSettingsTab(this.slider as any).open();
    });

    this.buttons.notifications.addEventListener('click', () => {
      new AppNotificationsTab(this.slider).open();
    });

    this.buttons.privacy.addEventListener('click', () => {
      new AppPrivacyAndSecurityTab(this.slider).open();
    });
  }

  public fillElements() {
    let user = appUsersManager.getSelf();
    this.avatarElem.setAttribute('peer', '' + user.id);

    this.nameDiv.innerHTML = user.rFullName || '';
    this.phoneDiv.innerHTML = user.rPhone || '';
  }

  public onOpen() {
    if(this.init) {
      this.init();
      this.init = null;
    }

    this.fillElements();
  }
}
