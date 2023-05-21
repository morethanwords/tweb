/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {InputFile} from '../../../layer';
import appDialogsManager from '../../../lib/appManagers/appDialogsManager';
import InputField from '../../inputField';
import {SliderSuperTab} from '../../slider';
import AvatarEdit from '../../avatarEdit';
import I18n, {joinElementsWith} from '../../../lib/langPack';
import ButtonCorner from '../../buttonCorner';
import getUserStatusString from '../../wrappers/getUserStatusString';
import appImManager from '../../../lib/appManagers/appImManager';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import SettingSection from '../../settingSection';

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

  public init({
    peerIds,
    isGeoChat = false,
    onCreate,
    openAfter = true,
    title,
    asChannel = false
  }: {
    peerIds: PeerId[],
    isGeoChat?: boolean,
    onCreate?: (chatId: ChatId) => void,
    openAfter?: boolean,
    title?: string,
    asChannel?: boolean
  }) {
    this.isGeoChat = isGeoChat;
    this.peerIds = peerIds;

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
      const userIds = this.peerIds.map((peerId) => peerId.toUserId());

      let promise: Promise<ChatId>;
      if(this.isGeoChat) {
        if(!this.userLocationAddress || !this.userLocationCoords) return;
        promise = this.managers.appChatsManager.createChannel({
          title,
          about: '',
          geo_point: {
            _: 'inputGeoPoint',
            ...this.userLocationCoords
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

        if(asChannel) {
          promise = this.managers.appChatsManager.createChannel({
            megagroup: true,
            title,
            about: ''
          });

          if(peerIds.length) {
            promise = promise.then((chatId) => {
              return this.managers.appChatsManager.inviteToChannel(chatId, userIds)
              .then(() => chatId);
            });
          }
        } else {
          promise = this.managers.appChatsManager.createChat(
            title,
            userIds
          );
        }

        promise = promise.then((chatId) => {
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
        onCreate?.(chatId);
        this.close();
        if(openAfter) appImManager.setInnerPeer({peerId: chatId.toPeerId(true)});
      });
    }, {listenerSetter: this.listenerSetter});

    const chatsSection = new SettingSection({
      name: 'Members',
      nameArgs: [this.peerIds.length]
    });

    if(!this.peerIds.length) {
      chatsSection.container.classList.add('hide');
    }

    const list = this.list = appDialogsManager.createChatList({
      new: true
    });

    chatsSection.content.append(list);

    section.content.append(this.avatarEdit.container, inputWrapper);

    this.content.append(this.nextBtn);
    this.scrollable.append(section.container, chatsSection.container);

    if(isGeoChat) {
      this.setTitle('NearbyCreateGroup');
      this.groupLocationInputField.container.classList.remove('hide');
      this.groupLocationInputField.setValueSilently(I18n.format('Loading', true));
      this.startLocating();
    } else {
      this.groupLocationInputField.container.classList.add('hide');
    }

    const usersPromise = Promise.all(this.peerIds.map((peerId) => this.managers.appUsersManager.getUser(peerId.toUserId())));
    const myUserPromise = this.managers.appUsersManager.getSelf();

    const a = usersPromise.then((users) => {
      return users.map((user) => {
        const {dom} = appDialogsManager.addDialogNew({
          peerId: user.id.toPeerId(false),
          container: this.list,
          rippleEnabled: false,
          avatarSize: 'abitbigger'
        });

        dom.lastMessageSpan.append(getUserStatusString(user));
      })
    });

    let setTitlePromise: Promise<void>;

    if(!title) setTitlePromise = this.peerIds.length > 0 && this.peerIds.length < 5 ? Promise.all([usersPromise, myUserPromise]).then(([users, myUser]) => {
      const names = users.map((user) => [user.first_name, user.last_name].filter(Boolean).join(' '));
      names.unshift(myUser.first_name);

      const joined = joinElementsWith(names, (isLast) => isLast ? ', ' : ' & ').join('');
      this.groupNameInputField.setDraftValue(joined);
    }) : Promise.resolve();
    else {
      this.groupNameInputField.setDraftValue(title);
    }

    return Promise.all([
      a,
      setTitlePromise
    ]);
  }

  public onCloseAfterTimeout() {
    this.avatarEdit.clear();
    this.uploadAvatar = null;
    this.groupNameInputField.value = '';
    this.groupLocationInputField.container.classList.add('hide');
    this.nextBtn.disabled = false;
  }

  private startLocating() {
    navigator.geolocation.getCurrentPosition((location) => {
      this.userLocationCoords = {
        lat: location.coords.latitude,
        long: location.coords.longitude
      };

      let uri = 'https://nominatim.openstreetmap.org/reverse';
      uri += '?lat='+location.coords.latitude;
      uri += '&lon='+location.coords.longitude;
      uri += '&format=json';
      uri += '&addressdetails=1';
      uri += '&accept-language=en';
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
