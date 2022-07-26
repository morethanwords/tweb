/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appSidebarLeft, { SettingSection } from "..";
import { InputFile } from "../../../layer";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import InputField from "../../inputField";
import { SliderSuperTab } from "../../slider";
import AvatarEdit from "../../avatarEdit";
import I18n from "../../../lib/langPack";
import ButtonCorner from "../../buttonCorner";
import getUserStatusString from "../../wrappers/getUserStatusString";
import appImManager from "../../../lib/appManagers/appImManager";
import { attachClickEvent } from "../../../helpers/dom/clickEvent";

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
  private avatarEdit: AvatarEdit;
  private uploadAvatar: () => Promise<InputFile> = null;
  private peerIds: PeerId[];
  private isGeoChat: boolean = false;
  private nextBtn: HTMLButtonElement;
  private groupNameInputField: InputField;
  private list: HTMLUListElement;
  private groupLocationInputField: InputField;
  private userLocationCoords: {lat: number, long: number};
  private userLocationAddress: string;

  protected init() {
    this.container.classList.add('new-group-container');
    this.setTitle('NewGroup');

    this.avatarEdit = new AvatarEdit((_upload) => {
      this.uploadAvatar = _upload;
    });

    const section = new SettingSection({});

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

    this.listenerSetter.add(this.groupNameInputField.input)('input', () => {
      const value = this.groupNameInputField.value;
      let valueCheck = !!value.length && !this.groupNameInputField.input.classList.contains('error');
      if(this.isGeoChat) valueCheck = valueCheck && !!this.userLocationCoords && !!this.userLocationAddress;
      this.nextBtn.classList.toggle('is-visible', !!valueCheck);
    });

    this.nextBtn = ButtonCorner({icon: 'arrow_next'});

    attachClickEvent(this.nextBtn, () => {
      const title = this.groupNameInputField.value;

      let promise: Promise<ChatId>;
      if(this.isGeoChat) {
        if(!this.userLocationAddress || !this.userLocationCoords) return;
        promise = this.managers.appChatsManager.createChannel({
          title, 
          about: '', 
          geo_point: {
            _: 'inputGeoPoint',
            ...this.userLocationCoords, 
          },
          address: this.userLocationAddress,
          megagroup: true
        }).then((chatId) => {
          if(this.uploadAvatar) {
            this.uploadAvatar().then((inputFile) => {
              this.managers.appChatsManager.editPhoto(chatId, inputFile);
            });
          }

          if(this.peerIds.length) {
            this.managers.appChatsManager.inviteToChannel(chatId, this.peerIds);
          }

          return chatId;
        });
      } else {
        this.nextBtn.disabled = true;
        promise = this.managers.appChatsManager.createChat(title, this.peerIds.map((peerId) => peerId.toUserId())).then((chatId) => {
          if(this.uploadAvatar) {
            this.uploadAvatar().then((inputFile) => {
              this.managers.appChatsManager.editPhoto(chatId, inputFile);
            });
          }
          
          return chatId;
        });
      }

      if(!promise) {
        return;
      }

      promise.then((chatId) => {
        appSidebarLeft.removeTabFromHistory(this);
        appSidebarLeft.selectTab(0);

        appImManager.setInnerPeer({peerId: chatId.toPeerId(true)});
      });
    }, {listenerSetter: this.listenerSetter});

    const chatsSection = new SettingSection({
      name: 'Members',
      nameArgs: [this.peerIds.length]
    });

    const list = this.list = appDialogsManager.createChatList({
      new: true
    });

    chatsSection.content.append(list);

    section.content.append(this.avatarEdit.container, inputWrapper);

    this.content.append(this.nextBtn);
    this.scrollable.append(section.container, chatsSection.container);
  }

  public onCloseAfterTimeout() {
    this.avatarEdit.clear();
    this.uploadAvatar = null;
    this.groupNameInputField.value = '';
    this.groupLocationInputField.container.classList.add('hide');
    this.nextBtn.disabled = false;
  }

  public open(peerIds: PeerId[], isGeoChat: boolean = false) {
    this.isGeoChat = isGeoChat;
    this.peerIds = peerIds;
    const result = super.open();
    result.then(() => {
      if(isGeoChat) {
        this.setTitle('NearbyCreateGroup');
        this.groupLocationInputField.container.classList.remove('hide');
        this.groupLocationInputField.setValueSilently(I18n.format('Loading', true));
        this.startLocating();
      } else {
        this.groupLocationInputField.container.classList.add('hide');
      }

      return Promise.all(this.peerIds.map(async(userId) => {
        const {dom} = appDialogsManager.addDialogNew({
          peerId: userId,
          container: this.list,
          rippleEnabled: false,
          avatarSize: 48
        });

        dom.lastMessageSpan.append(getUserStatusString(await this.managers.appUsersManager.getUser(userId)));
      }));
    });
    
    return result;
  }

  private startLocating() {
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
      .then((response) => response.json())
      .then((response: OpenStreetMapInterface) => {
        this.userLocationAddress = response.display_name;
        this.groupLocationInputField.setValueSilently(response.display_name);
      });
    }, (error) => {
      if(error instanceof GeolocationPositionError) {
        this.groupLocationInputField.setValueSilently('Location permission denied. Please retry later.');
      } else {
        this.groupLocationInputField.setValueSilently('An error has occurred. Please retry later.');
      }
    });
  }
}
