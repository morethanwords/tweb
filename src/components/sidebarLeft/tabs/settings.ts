import SidebarSlider, { SliderSuperTab } from "../../slider";
import AvatarElement from "../../avatar";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import appSidebarLeft, { AppSidebarLeft } from "..";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import ButtonMenuToggle from "../../buttonMenuToggle";
import Button from "../../button";

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

  constructor(slider: SidebarSlider) {
    super(slider);
  }

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
    
    this.nameDiv = document.createElement('div');
    this.nameDiv.classList.add('profile-name');

    this.phoneDiv = document.createElement('div');
    this.phoneDiv.classList.add('profile-subtitle');

    const buttonsDiv = document.createElement('div');
    buttonsDiv.classList.add('profile-buttons');

    const className = 'profile-button btn-primary btn-transparent';
    buttonsDiv.append(this.buttons.edit = Button(className, {icon: 'edit', rippleSquare: true, text: 'Edit Profile'}));
    buttonsDiv.append(this.buttons.folders = Button(className, {icon: 'folder', rippleSquare: true, text: 'Chat Folders'}));
    buttonsDiv.append(this.buttons.general = Button(className + ' btn-disabled', {icon: 'settings', rippleSquare: true, text: 'General Settings'}));
    buttonsDiv.append(this.buttons.notifications = Button(className + ' btn-disabled', {icon: 'unmute', rippleSquare: true, text: 'Notifications'}));
    buttonsDiv.append(this.buttons.privacy = Button(className + ' btn-disabled', {icon: 'lock', rippleSquare: true, text: 'Privacy and Security'}));
    buttonsDiv.append(this.buttons.language = Button(className + ' btn-disabled', {icon: 'language', rippleSquare: true, text: 'Language'}));
    
    this.scrollable.append(this.avatarElem, this.nameDiv, this.phoneDiv, buttonsDiv);
    this.scrollable.container.classList.add('profile-content-wrapper');

    /* rootScope.$on('user_auth', (e) => {
      this.fillElements();
    }); */

    this.buttons.edit.addEventListener('click', () => {
      appSidebarLeft.editProfileTab.fillElements();
      appSidebarLeft.editProfileTab.open();
    });

    this.buttons.folders.addEventListener('click', () => {
      appSidebarLeft.chatFoldersTab.open();
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

  onClose() {

  }
}