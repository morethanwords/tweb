/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {SliderSuperTab} from '../../slider';
import ButtonCorner from '../../buttonCorner';
import AppNewGroupTab from './newGroup';
import {toast} from '../../toast';
import {ButtonMenuItemOptions} from '../../buttonMenu';
import {i18n, join, _i18n} from '../../../lib/langPack';
import rootScope from '../../../lib/rootScope';
import wrapSticker from '../../wrappers/sticker';
import SortedUserList from '../../sortedUserList';
import {PeerLocated, Update, Updates} from '../../../layer';
import {SettingChatListSection} from '..';
import appDialogsManager from '../../../lib/appManagers/appDialogsManager';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import confirmationPopup from '../../confirmationPopup';
import getPeerId from '../../../lib/appManagers/utils/peers/getPeerId';
import type LazyLoadQueue from '../../lazyLoadQueue';

export default class AppPeopleNearbyTab extends SliderSuperTab {
  private latestLocationSaved: {latitude: number, longitude: number, accuracy: number};
  private isLocationWatched: boolean = false;
  private errorCategory: HTMLElement;
  private retryBtn: HTMLButtonElement;
  private btnOptions: HTMLButtonElement;
  private menuButtons: (ButtonMenuItemOptions & {verify?: () => boolean})[];

  protected lazyLoadQueue: LazyLoadQueue;
  protected peopleSection: SettingChatListSection;
  protected chatsSection: SettingChatListSection;

  protected locatedPeers: Map<PeerId, PeerLocated.peerLocated>;

  // public async init() {
  //   this.container.classList.add('people-nearby-container');
  //   this.setTitle('PeopleNearby');

  //   this.errorCategory = document.createElement('div');
  //   this.errorCategory.classList.add('text', 'hide', 'nearby-error');

  //   this.retryBtn = ButtonCorner({icon: 'check'});

  //   const emoji = '🧭';
  //   const doc = await this.managers.appStickersManager.getAnimatedEmojiSticker(emoji);
  //   const stickerContainer = document.createElement('div');
  //   stickerContainer.classList.add('sticker-container');

  //   if(doc) {
  //     wrapSticker({
  //       doc,
  //       div: stickerContainer,
  //       loop: false,
  //       play: true,
  //       width: 86,
  //       height: 86,
  //       emoji,
  //       needUpscale: true
  //     }).then(() => {
  //       // this.animation = player;
  //     });
  //   } else {
  //     stickerContainer.classList.add('media-sticker-wrapper');
  //   }

  //   const caption = document.createElement('div');
  //   caption.classList.add('caption');
  //   _i18n(caption, 'PeopleNearbyInfo2');

  //   this.locatedPeers = new Map();

  //   const m = () => {
  //     const sortedUserList = new SortedUserList({
  //       avatarSize: 42,
  //       createChatListOptions: {
  //         dialogSize: 48,
  //         new: true
  //       },
  //       autonomous: false,
  //       onUpdate: (element) => {
  //         const peer = this.locatedPeers.get(element.id);
  //         const elements: HTMLElement[] = [
  //           this.parseDistance(peer.distance)
  //         ];

  //         if(!element.id.isUser()) {
  //           elements.push(this.managers.appProfileManager.getChatMembersString(element.id.toChatId()));
  //         }

  //         element.dom.lastMessageSpan.textContent = '';
  //         element.dom.lastMessageSpan.append(...join(elements, false));
  //       },
  //       getIndex: (element) => {
  //         const peer = this.locatedPeers.get(element.id);
  //         return 0x7FFFFFFF - peer.distance;
  //       },
  //       appUsersManager: this.managers.appUsersManager
  //     });

  //     appDialogsManager.setListClickListener(sortedUserList.list, undefined, undefined, false);

  //     return sortedUserList;
  //   };

  //   const peopleSection = this.peopleSection = new SettingChatListSection({
  //     name: 'PeopleNearbyHeader',
  //     sortedList: m()
  //   });

  //   const chatsSection = this.chatsSection = new SettingChatListSection({
  //     name: 'ChatsNearbyHeader',
  //     sortedList: m()
  //   });

  //   const btnMakeVisible = peopleSection.makeButton({
  //     text: 'MakeMyselfVisible',
  //     icon: 'location'
  //   });

  //   const btnMakeInvisible = peopleSection.makeButton({
  //     text: 'StopShowingMe',
  //     icon: 'location'
  //   });

  //   const btnCreateGroup = chatsSection.makeButton({
  //     text: 'NearbyCreateGroup',
  //     icon: 'newgroup'
  //   });

  //   attachClickEvent(btnMakeVisible, () => {
  //     confirmationPopup({
  //       titleLangKey: 'MakeMyselfVisibleTitle',
  //       descriptionLangKey: 'MakeMyselfVisibleInfo',
  //       button: {
  //         langKey: 'OK'
  //       }
  //     }).then(() => {
  //       this.startWatching();
  //     });
  //   }, {listenerSetter: this.listenerSetter});

  //   attachClickEvent(btnMakeInvisible, () => {
  //     this.stopWatching();
  //   }, {listenerSetter: this.listenerSetter});

  //   attachClickEvent(btnCreateGroup, () => {
  //     this.slider.createTab(AppNewGroupTab).open([], true);
  //   }, {listenerSetter: this.listenerSetter});

  //   btnMakeVisible.classList.add('primary');
  //   btnMakeInvisible.classList.add('danger');
  //   btnCreateGroup.classList.add('primary');

  //   this.content.append(this.retryBtn);
  //   this.scrollable.append(
  //     stickerContainer,
  //     caption,
  //     peopleSection.container,
  //     chatsSection.container,
  //     this.errorCategory
  //   );
  // }

  private parseDistance(distance: number) {
    if(rootScope.settings.distanceUnit === 'miles') {
      if(distance > 1609.34) {
        return i18n('MilesAway', [Math.round(distance / 1609)]);
      } else {
        return i18n('FootsAway', [Math.round(distance * 3.281)]);
      }
    } else {
      if(distance >= 1000) {
        return i18n('KMetersAway2', [distance / 1000]);
      } else {
        return i18n('MetersAway2', [distance]);
      }
    }
  }

  // public open() {
  //   const result = super.open();
  //   result.then(() => {
  //     this.retryBtn.classList.remove('is-visible');
  //     navigator.geolocation.getCurrentPosition((location) => {
  //       this.latestLocationSaved = {
  //         latitude: location.coords.latitude,
  //         longitude: location.coords.longitude,
  //         accuracy: location.coords.accuracy
  //       };

  //       console.log(this.latestLocationSaved);

  //       this.managers.appUsersManager.getLocated(
  //         location.coords.latitude,
  //         location.coords.longitude,
  //         location.coords.accuracy
  //       ).then((response) => {
  //         const update = (response as Updates.updates).updates[0] as Update.updatePeerLocated;
  //         const peers = update.peers as PeerLocated.peerLocated[];
  //         const orderedPeers = peers.sort((a, b) => a.distance - b.distance);
  //         const groupsCounter = peers.filter((e) => e.peer._ == 'peerChannel').length;
  //         const usersCounter = peers.filter((e) => e.peer._ != 'peerChannel').length;
  //         orderedPeers?.forEach((peer) => {
  //           const peerId = getPeerId(peer.peer);
  //           const section = peerId.isUser() ? this.peopleSection : this.chatsSection;
  //           this.locatedPeers.set(peerId, peer);
  //           section.sortedList.add(peerId);
  //         });

  //         this.errorCategory.classList.toggle('hide', !!(usersCounter || groupsCounter));
  //         this.errorCategory.innerHTML = 'No groups or channels found around you.';
  //       });
  //     }, (error) => {
  //       this.errorCategory.classList.remove('hide');
  //       this.retryBtn.classList.add('is-visible');
  //       this.retryBtn.addEventListener('click', this.open);
  //       if(error instanceof GeolocationPositionError) {
  //         this.errorCategory.innerHTML = 'Location permission denied. Click below to retry.';
  //       } else {
  //         this.errorCategory.innerHTML = 'An error has occurred. Please retry later clicking the button below.';
  //       }
  //     });
  //   });

  //   return result;
  // }

  private startWatching() {
    if(!this.latestLocationSaved || this.isLocationWatched) return;
    this.isLocationWatched = true;

    toast('Your position is now being shared. Do not close the page or it will be suspended.');

    this.managers.appUsersManager.getLocated(
      this.latestLocationSaved.latitude,
      this.latestLocationSaved.longitude,
      this.latestLocationSaved.accuracy,
      true, // background parameter
      0x7fffffff // self_expires parameter
    );

    navigator.geolocation.watchPosition((result) => {
      const isLongitudeDifferent = result.coords.longitude !== this.latestLocationSaved.longitude;
      const isLatitudeDifferent = result.coords.latitude !== this.latestLocationSaved.latitude;
      const distanceCheck = this.calculateDistance(
        result.coords.latitude, result.coords.longitude,
        this.latestLocationSaved.latitude, this.latestLocationSaved.longitude
      ) > 100;

      if((isLatitudeDifferent || isLongitudeDifferent) && distanceCheck) {
        this.managers.appUsersManager.getLocated(
          result.coords.latitude,
          result.coords.longitude,
          result.coords.accuracy,
          true, // background parameter
          0x7fffffff // self_expires parameter
        );
        this.latestLocationSaved = {
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: result.coords.accuracy
        }
      }
    });
  }

  private stopWatching() {
    if(!this.isLocationWatched) return;
    this.isLocationWatched = false;
    toast('The sharing of your position has been stopped. You will no longer be visible to other users.');
    this.managers.appUsersManager.getLocated(
      0, // latitude parameter
      0, // longitude parameter
      0, // accuracy parameter
      false, // background parameter
      0 // self_expires parameter
    );
  }

  private calculateDistance(lat1: number, long1: number, lat2: number, long2: number) {
    const p = 0.017453292519943295; // Math.PI/180
    return (
      12742 * Math.asin(
        Math.sqrt(
          (0.5 - Math.cos((lat2 - lat1) * p)) +
          (
            Math.cos(lat1 * p) * Math.cos(lat2 * p) *
            (1 - Math.cos((long2 - long1) * p)/2)
          )
        )
      )
    );
  }
}
