/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SliderSuperTab } from "../../slider";
import AvatarElement from "../../avatar";
import ButtonCorner from "../../buttonCorner";
import { InputUser } from "../../../layer";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import appImManager from "../../../lib/appManagers/appImManager";
import ButtonMenuToggle from "../../buttonMenuToggle";
import { SearchGroup } from "../../appSearch";
import Button from "../../button";
import PeerTitle from "../../peerTitle";
import lottieLoader from "../../../lib/rlottie/lottieLoader";
import PopupPeer from "../../popups/peer";
import AppNewGroupTab from "./newGroup";
import { toast } from "../../toast";
import { ButtonMenuItemOptions } from "../../buttonMenu";
import { cancelEvent } from "../../../helpers/dom/cancelEvent";
import type { LazyLoadQueueIntersector } from "../../lazyLoadQueue";
import I18n, { i18n } from "../../../lib/langPack";
import rootScope from '../../../lib/rootScope';

export default class AppPeopleNearby extends SliderSuperTab {
  private usersCategory = new SearchGroup(true, 'contacts', true, 'people-nearby-users', false);
  private groupsCategory = new SearchGroup(true, 'contacts', true, 'people-nearby-groups', false);
  private latestLocationSaved: { latitude: number, longitude: number, accuracy: number };
  private isLocationWatched: boolean = false;
  private errorCategory: HTMLElement;
  private retryBtn: HTMLButtonElement;
  private btnOptions: HTMLButtonElement;
  private menuButtons: (ButtonMenuItemOptions & {verify?: () => boolean})[];

  protected lazyLoadQueue: LazyLoadQueueIntersector;

  protected init() {
    this.container.classList.add('peoplenearby-container');
    this.setTitle('PeopleNearby');

    this.menuButtons = [{
      icon: 'tip',
      text: 'MakeMyselfVisible',
      onClick: () => this.startWatching(),
      verify: () => !this.isLocationWatched
    },
    {
      icon: 'tip',
      text: 'StopShowingMe',
      onClick: () => this.stopWatching(),
      verify: () => this.isLocationWatched
    },
    {
      icon: 'newgroup',
      text: 'NearbyCreateGroup',
      onClick: () => {
        new AppNewGroupTab(this.slider).open([], true);
      }
    }];
    
    this.btnOptions = ButtonMenuToggle({}, 'bottom-left', this.menuButtons, () => this.verifyButtons());

    this.header.append(this.btnOptions);

    const locatingIcon = document.createElement('span');
    locatingIcon.classList.add('tgico', 'tgico-location');

    const locatingAnimation = document.createElement('div');
    locatingAnimation.classList.add('locating-animation-container');
    locatingAnimation.appendChild(locatingIcon);

    for(let i=1; i<=4; i++){
      let animatingWaves = document.createElement('div');
      animatingWaves.classList.add('locating-animation-waves', 'wave-'+i);
      locatingAnimation.appendChild(animatingWaves);
    }

    this.errorCategory = document.createElement('div');
    this.errorCategory.classList.add('text', 'hide', 'nearby-error');

    this.retryBtn = ButtonCorner({icon: 'check'});

    const textContainer = document.createElement('div');
    textContainer.classList.add('text', 'nearby-description');
    textContainer.appendChild(i18n('PeopleNearbyInfo2'));

    const chatsContainer = document.createElement('div');
    chatsContainer.classList.add('chatlist-container');
    chatsContainer.append(this.usersCategory.container);
    chatsContainer.append(this.groupsCategory.container);

    this.content.append(this.retryBtn);
    this.scrollable.append(
      locatingAnimation,
      textContainer,
      this.errorCategory,
      chatsContainer
    );
  }

  public onCloseAfterTimeout() {
    this.usersCategory.clear();
    this.groupsCategory.clear();
  }

  private verifyButtons(e?: Event){
    const isMenuOpen = !!e || !!(this.btnOptions && this.btnOptions.classList.contains('menu-open'));
    e && cancelEvent(e);

    this.menuButtons.filter(button => button.verify).forEach(button => {
      button.element.classList.toggle('hide', !button.verify());
    });
  }

  private parseDistance(distance: number){
    if(rootScope.settings.distanceUnit == 'miles'){
      if(distance > 1609.34) {
        return i18n('MilesAway', [Math.round(distance / 1609)]);
      }else{
        return i18n('FootsAway', [Math.round(distance * 3.281)]);
      }
    }else{
      if(distance >= 1000){
        return i18n('KMetersAway2', [distance / 1000]);
      }else{
        return i18n('MetersAway2', [distance]);
      }
    }
  }

  // @ts-ignore
  public open() {
    const result = super.open();
    result.then(() => {
      this.retryBtn.classList.remove('is-visible');
      navigator.geolocation.getCurrentPosition((location) => {
        this.latestLocationSaved = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy
        };

        console.log(this.latestLocationSaved);

        appUsersManager.getLocated(
          location.coords.latitude,
          location.coords.longitude,
          location.coords.accuracy
        ).then((response) => {

          // @ts-ignore
          const orderedPeers = response?.updates[0]?.peers.sort((a, b) => a.distance-b.distance);
          // @ts-ignore
          const groupsCounter = response?.updates[0]?.peers.filter((e) => e.peer._ == 'peerChannel').length;
          // @ts-ignore
          const usersCounter = response?.updates[0]?.peers.filter((e) => e.peer._ != 'peerChannel').length;
          // @ts-ignore
          orderedPeers?.forEach(peer => {
            const isChannel = peer.peer._ == 'peerChannel';
            const peerId = (isChannel ? -peer.peer.channel_id : peer.peer.user_id);

            let {dialog, dom} = appDialogsManager.addDialogNew({
              dialog: peerId,
              container: (isChannel ? this.groupsCategory : this.usersCategory).list,
              drawStatus: false,
              rippleEnabled: true,
              meAsSaved: true,
              avatarSize: 48,
              lazyLoadQueue: this.lazyLoadQueue
            });

            dom.lastMessageSpan.append(this.parseDistance(peer.distance));
            dom.containerEl.onclick = () => appImManager.setPeer(peerId);

            if(isChannel){
              let participantsCount = 0;
              // @ts-ignore
              for(let chat of response.chats){
                if(chat.id == peer.peer.channel_id){
                  participantsCount = chat.participants_count;
                  break;
                }
              }
              dom.lastMessageSpan.append(', ', i18n('Members', [participantsCount]));
            }
          });

          this.usersCategory.nameEl.textContent = '';
          this.usersCategory.nameEl.append(i18n('PeopleNearbyHeader'));
          usersCounter && this.usersCategory.setActive();

          this.groupsCategory.nameEl.textContent = '';
          this.groupsCategory.nameEl.append(i18n('ChatsNearbyHeader'));
          groupsCounter && this.groupsCategory.setActive();

          this.errorCategory.classList.toggle('hide', (usersCounter || groupsCounter));
          this.errorCategory.innerHTML = "No groups or channels found around you.";
        });
      }, (error) => {
        this.errorCategory.classList.remove('hide');
        this.retryBtn.classList.add('is-visible');
        this.retryBtn.addEventListener('click', this.open);
        if(error instanceof GeolocationPositionError){
          this.errorCategory.innerHTML = "Location permission denied. Click below to retry.";
        }else{
          this.errorCategory.innerHTML = "An error has occurred. Please retry later clicking the button below.";
        }
      });
    });
  }

  private startWatching(){
    if(!this.latestLocationSaved || this.isLocationWatched) return;
    this.isLocationWatched = true;

    toast('Your position is now being shared. Do not close the page or it will be suspended.');

    appUsersManager.getLocated(
      this.latestLocationSaved.latitude,
      this.latestLocationSaved.longitude,
      this.latestLocationSaved.accuracy,
      true, // background parameter
      0x7fffffff // self_expires parameter
    );

    navigator.geolocation.watchPosition(
      (result) => {
        const isLongitudeDifferent = result.coords.longitude != this.latestLocationSaved.longitude;
        const isLatitudeDifferent = result.coords.latitude != this.latestLocationSaved.latitude;
        const distanceCheck = this.calculateDistance(
          result.coords.latitude, result.coords.longitude,
          this.latestLocationSaved.latitude, this.latestLocationSaved.longitude
        ) > 100;
        if((isLatitudeDifferent || isLongitudeDifferent) && distanceCheck){
          appUsersManager.getLocated(
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
      }
    );
  }

  private stopWatching(){
    if(!this.isLocationWatched) return;
    this.isLocationWatched = false;
    toast('The sharing of your position has been stopped. You will no longer be visible to other users.');
    appUsersManager.getLocated(
      0, // latitude parameter
      0, // longitude parameter
      0, // accuracy parameter
      false, // background parameter
      0 // self_expires parameter
    );
  }

  private calculateDistance(lat1: number, long1: number, lat2: number, long2: number){
    const p = 0.017453292519943295; // Math.PI/180
    return (
      12742 * Math.asin(
        Math.sqrt(
          (0.5 - Math.cos((lat2-lat1) * p)) +
          (
            Math.cos(lat1 * p) * Math.cos(lat2 * p)
            * (1 - Math.cos((long2 - long1) * p)/2)
          )
        )
      )
    );
  }
}
