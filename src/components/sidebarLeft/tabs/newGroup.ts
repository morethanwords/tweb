/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appSidebarLeft from "..";
import { InputFile } from "../../../layer";
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import { SearchGroup } from "../../appSearch";
import InputField from "../../inputField";
import { SliderSuperTab } from "../../slider";
import AvatarEdit from "../../avatarEdit";
import I18n, { i18n } from "../../../lib/langPack";
import ButtonCorner from "../../buttonCorner";

interface OpenStreetMapInterface {
  place_id?: number;
  license?: string;
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  display_name: string;
  address?: object;
  boundingbox?: object;
}

export default class AppNewGroupTab extends SliderSuperTab {
  private searchGroup = new SearchGroup(true, 'contacts', true, 'new-group-members disable-hover', false);
  private avatarEdit: AvatarEdit;
  private uploadAvatar: () => Promise<InputFile> = null;
  private peerIds: PeerId[];
  private isGeoChat: boolean = false;
  private nextBtn: HTMLButtonElement;
  private groupNameInputField: InputField;
  private groupLocationInputField: InputField;
  private userLocationCoords: { lat: number, long: number };
  private userLocationAddress: string;

  protected init() {
    this.container.classList.add('new-group-container');
    this.setTitle('NewGroup');

    this.avatarEdit = new AvatarEdit((_upload) => {
      this.uploadAvatar = _upload;
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    this.groupNameInputField = new InputField({
      label: 'CreateGroup.NameHolder',
      maxLength: 128
    });

    this.groupLocationInputField = new InputField({
      label: 'ChatLocation',
      name: 'location',
      canBeEdited: false
    });

    inputWrapper.append(
      this.groupNameInputField.container,
      this.groupLocationInputField.container
    );

    this.groupNameInputField.input.addEventListener('input', () => {
      const value = this.groupNameInputField.value;
      let valueCheck = !!value.length && !this.groupNameInputField.input.classList.contains('error');
      if(this.isGeoChat) valueCheck = valueCheck && !!this.userLocationCoords && !!this.userLocationAddress;
      this.nextBtn.classList.toggle('is-visible', !!valueCheck);
    });

    this.nextBtn = ButtonCorner({icon: 'arrow_next'});

    this.nextBtn.addEventListener('click', () => {
      const title = this.groupNameInputField.value;

      if(this.isGeoChat){
        if(!this.userLocationAddress || !this.userLocationCoords) return;
        appChatsManager.createGeoChat(title, '', this.userLocationCoords, this.userLocationAddress).then((chatId) => {
          if(this.uploadAvatar) {
            this.uploadAvatar().then((inputFile) => {
              appChatsManager.editPhoto(chatId, inputFile);
            });
          }

          if(this.peerIds.length){
            appChatsManager.inviteToChannel(chatId, this.peerIds);
          }
          
          appSidebarLeft.removeTabFromHistory(this);
          appSidebarLeft.selectTab(0);
        });
      }else{
        this.nextBtn.disabled = true;
        appChatsManager.createChat(title, this.peerIds.map(peerId => peerId.toUserId())).then((chatId) => {
          if(this.uploadAvatar) {
            this.uploadAvatar().then((inputFile) => {
              appChatsManager.editPhoto(chatId, inputFile);
            });
          }
          
          appSidebarLeft.removeTabFromHistory(this);
          appSidebarLeft.selectTab(0);
        });
      }
    });

    const chatsContainer = document.createElement('div');
    chatsContainer.classList.add('chatlist-container');
    chatsContainer.append(this.searchGroup.container);

    this.content.append(this.nextBtn);
    this.scrollable.append(this.avatarEdit.container, inputWrapper, chatsContainer);
  }

  public onCloseAfterTimeout() {
    this.searchGroup.clear();
    this.avatarEdit.clear();
    this.uploadAvatar = null;
    this.groupNameInputField.value = '';
    this.groupLocationInputField.container.classList.add('hide');
    this.nextBtn.disabled = false;
  }

  public open(peerIds: PeerId[], isGeoChat: boolean = false) {
    const result = super.open();
    result.then(() => {
      this.isGeoChat = isGeoChat;
      this.peerIds = peerIds;

      if(isGeoChat){
        this.setTitle('NearbyCreateGroup');
        this.groupLocationInputField.container.classList.remove('hide');
        this.groupLocationInputField.setValueSilently(I18n.format('Loading', true));
        this.startLocating();
      }else{
        this.groupLocationInputField.container.classList.add('hide');
      }

      this.peerIds.forEach(userId => {
        let {dom} = appDialogsManager.addDialogNew({
          dialog: userId,
          container: this.searchGroup.list,
          drawStatus: false,
          rippleEnabled: false,
          avatarSize: 48
        });

        dom.lastMessageSpan.append(appUsersManager.getUserStatusString(userId));
      });

      this.searchGroup.nameEl.textContent = '';
      this.searchGroup.nameEl.append(i18n('Members', [this.peerIds.length]));
      this.peerIds.length && this.searchGroup.setActive();
    });
    
    return result;
  }

  private startLocating(){
    navigator.geolocation.getCurrentPosition((location) => {
      this.userLocationCoords = {
        lat: location.coords.latitude,
        long: location.coords.longitude
      };

      let uri = "https://nominatim.openstreetmap.org/reverse";
      uri += "?lat="+location.coords.latitude;
      uri += "&lon="+location.coords.longitude;
      uri += "&format=json";
      uri += "&addressdetails=1";
      uri += "&accept-language=en";
      fetch(uri)
      // @ts-ignore
      .then((response) => response.json() as OpenStreetMapInterface)
      .then(
        (response: OpenStreetMapInterface) => {
          this.userLocationAddress = response.display_name;
          this.groupLocationInputField.setValueSilently(response.display_name);
        }
      );
    }, (error) => {
      if(error instanceof GeolocationPositionError){
        this.groupLocationInputField.setValueSilently('Location permission denied. Please retry later.');
      }else{
        this.groupLocationInputField.setValueSilently('An error has occurred. Please retry later.');
      }
    });
  }
}