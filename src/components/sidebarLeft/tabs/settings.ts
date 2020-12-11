import { SliderTab } from "../../slider";
import AvatarElement from "../../avatar";
import { parseMenuButtonsTo } from "../../misc";
//import rootScope from "../../lib/rootScope";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import appSidebarLeft, { AppSidebarLeft } from "..";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import { CLICK_EVENT_NAME } from "../../../helpers/dom";

export default class AppSettingsTab implements SliderTab {
  private container = document.querySelector('.settings-container') as HTMLDivElement;
  private avatarElem = this.container.querySelector('.profile-avatar') as AvatarElement;
  private nameDiv = this.container.querySelector('.profile-name') as HTMLDivElement;
  private phoneDiv = this.container.querySelector('.profile-subtitle') as HTMLDivElement;

  private logOutBtn = this.container.querySelector('.menu-logout') as HTMLButtonElement;

  private buttons: {
    edit: HTMLButtonElement,
    folders: HTMLButtonElement,
    general: HTMLButtonElement,
    notifications: HTMLButtonElement,
    privacy: HTMLButtonElement,
    language: HTMLButtonElement
  } = {} as any;

  constructor() {
    parseMenuButtonsTo(this.buttons, this.container.querySelector('.profile-buttons').children);

    /* rootScope.$on('user_auth', (e) => {
      this.fillElements();
    }); */

    this.logOutBtn.addEventListener(CLICK_EVENT_NAME, (e) => {
      apiManager.logOut();
    });

    this.buttons.edit.addEventListener('click', () => {
      appSidebarLeft.editProfileTab.fillElements();
      appSidebarLeft.selectTab(AppSidebarLeft.SLIDERITEMSIDS.editProfile);
    });

    this.buttons.folders.addEventListener('click', () => {
      appSidebarLeft.selectTab(AppSidebarLeft.SLIDERITEMSIDS.chatFolders);
    });
  }

  public fillElements() {
    let user = appUsersManager.getSelf();
    this.avatarElem.setAttribute('peer', '' + user.id);

    this.nameDiv.innerHTML = user.rFullName || '';
    this.phoneDiv.innerHTML = user.rPhone || '';
  }

  onClose() {

  }
}