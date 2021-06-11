/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MOUNT_CLASS_TO } from "../config/debug";
import appPeersManager from "../lib/appManagers/appPeersManager";
import rootScope from "../lib/rootScope";
import { i18n } from "../lib/langPack";
import replaceContent from "../helpers/dom/replaceContent";
import appUsersManager from "../lib/appManagers/appUsersManager";

export type PeerTitleOptions = {
  peerId: number,
  plainText?: boolean,
  onlyFirstName?: boolean,
  dialog?: boolean
};

const weakMap: WeakMap<HTMLElement, PeerTitle> = new WeakMap();

MOUNT_CLASS_TO.peerTitleWeakMap = weakMap;

rootScope.addEventListener('peer_title_edit', (peerId) => {
  const elements = Array.from(document.querySelectorAll(`.peer-title[data-peer-id="${peerId}"]`)) as HTMLElement[];
  elements.forEach(element => {
    const peerTitle = weakMap.get(element);
    //console.log('in the summer silence i was doing nothing', peerTitle, peerId);

    if(peerTitle) {
      peerTitle.update();
    }
  });
});

export default class PeerTitle {
  public element: HTMLElement;
  public peerId: number;
  public plainText = false;
  public onlyFirstName = false;
  public dialog = false;

  constructor(options: PeerTitleOptions) {
    this.element = document.createElement('span');
    this.element.classList.add('peer-title');
    this.element.setAttribute('dir', 'auto');
    
    this.update(options);
    weakMap.set(this.element, this);
  }

  public update(options?: PeerTitleOptions) {
    if(options) {
      for(let i in options) {
        // @ts-ignore
        this.element.dataset[i] = options[i] ? '' + (typeof(options[i]) === 'boolean' ? +options[i] : options[i]) : '0';
        // @ts-ignore
        this[i] = options[i];
      }
    }

    if(this.peerId !== rootScope.myId || !this.dialog) {
      if(this.peerId > 0 && appUsersManager.getUser(this.peerId).pFlags.deleted) {
        replaceContent(this.element, i18n(this.onlyFirstName ? 'Deleted' : 'HiddenName'));
      } else {
        this.element.innerHTML = appPeersManager.getPeerTitle(this.peerId, this.plainText, this.onlyFirstName);
      }
    } else {
      replaceContent(this.element, i18n(this.onlyFirstName ? 'Saved' : 'SavedMessages'));
    }
  }
}
