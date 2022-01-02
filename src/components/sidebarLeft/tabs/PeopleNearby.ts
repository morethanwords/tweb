/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SliderSuperTab } from "../../slider";
import AvatarElement from "../../avatar";
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
import type { LazyLoadQueueIntersector } from "../../lazyLoadQueue";
//import AppMediaViewer from "../../appMediaViewerNew";

export default class AppPeopleNearby extends SliderSuperTab {
  private usersCategory = new SearchGroup(true, 'contacts', true, 'people-nearby-users', false);
  private groupsCategory = new SearchGroup(true, 'contacts', true, 'people-nearby-groups', false);
  private latestLocationSaved: { latitude: number, longitude: number, accuracy: number };
  private isLocationWatched: boolean = false;

  protected lazyLoadQueue: LazyLoadQueueIntersector;

  protected init() {
    this.container.classList.add('peoplenearby-container');
    this.setTitle('PeopleNearby');
    
    const btnMenu = ButtonMenuToggle({}, 'bottom-left', [{
      icon: 'tip',
      text: 'PeopleNearby.VisibilityYes',
      onClick: this.startWatching
    },
    {
      icon: 'tip',
      text: 'PeopleNearby.VisibilityNo',
      onClick: this.startWatching
    }]);

    this.header.append(btnMenu);

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

    const chatsContainer = document.createElement('div');
    chatsContainer.classList.add('chatlist-container');
    chatsContainer.append(this.usersCategory.container);
    chatsContainer.append(this.groupsCategory.container);

    this.scrollable.append(locatingAnimation, chatsContainer);
  }

  private parseDistance(distance: number){
    return (distance >= 1000 ? String(distance/1000)+' km' : String(distance)+' m');
  }

  public opeddn() {
    const result = super.open();
    result.then(() => {
      navigator.geolocation.getCurrentPosition(location => {
        this.latestLocationSaved = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy
        };

        appUsersManager.getLocated(
          location.coords.latitude,
          location.coords.longitude,
          location.coords.accuracy
        ).then((response) => {

          // @ts-ignore
          const orderedPeers = response.updates[0].peers.sort((a, b) => a.distance-b.distance);
          // @ts-ignore
          orderedPeers.forEach(peer => {
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
              dom.lastMessageSpan.append(', '+String(participantsCount)+' members');
            }
          });

          this.usersCategory.nameEl.textContent = '';
          this.usersCategory.nameEl.append('Users');
          this.usersCategory.setActive();

          this.groupsCategory.nameEl.textContent = '';
          this.groupsCategory.nameEl.append('Groups');
          this.groupsCategory.setActive();
        });
      });
    });
  }

  private startWatching(){
    if(!this.latestLocationSaved || this.isLocationWatched) return;
    this.isLocationWatched = true;

    appUsersManager.getLocated(
      this.latestLocationSaved.latitude,
      this.latestLocationSaved.longitude,
      this.latestLocationSaved.accuracy,
      true, // background parameter
      3600 // self_expires parameter
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
            true // background parameter
          );
          this.latestLocationSaved = {
            latitude: result.coords.latitude,
            longitude: result.coords.longitude,
            accuracy: result.coords.accuracy
          }
        }
      }
    )
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
