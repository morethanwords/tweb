/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appProfileManager from "../lib/appManagers/appProfileManager";
import rootScope from "../lib/rootScope";
import { attachClickEvent, cancelEvent } from "../helpers/dom";
import AppMediaViewer, { AppMediaViewerAvatar } from "./appMediaViewer";
import { Message, Photo } from "../layer";
import appPeersManager from "../lib/appManagers/appPeersManager";
import appPhotosManager from "../lib/appManagers/appPhotosManager";
//import type { LazyLoadQueueIntersector } from "./lazyLoadQueue";

const onAvatarUpdate = (peerId: number) => {
  appProfileManager.removeFromAvatarsCache(peerId);
  (Array.from(document.querySelectorAll('avatar-element[peer="' + peerId + '"]')) as AvatarElement[]).forEach(elem => {
    //console.log('updating avatar:', elem);
    elem.update();
  });
};

rootScope.on('avatar_update', onAvatarUpdate);
rootScope.on('peer_title_edit', onAvatarUpdate);

export async function openAvatarViewer(target: HTMLElement, peerId: number, middleware: () => boolean, message?: any, prevTargets?: {element: HTMLElement, item: string | Message.messageService}[], nextTargets?: typeof prevTargets) {
  let photo = await appProfileManager.getFullPhoto(peerId);
  if(!middleware() || !photo) {
    return;
  }

  const getTarget = () => {
    const good = Array.from(target.querySelectorAll('img')).find(img => !img.classList.contains('emoji'));
    return good ? target : null;
  };

  if(peerId < 0) {
    const hadMessage = !!message;
    const inputFilter = 'inputMessagesFilterChatPhotos';
    if(!message) {
      message = await appMessagesManager.getSearch({
        peerId, 
        inputFilter: {_: inputFilter}, 
        maxId: 0, 
        limit: 1 
      }).then(value => {
        //console.log(lol);
        // ! by descend
        return value.history[0];
      });

      if(!middleware()) {
        return;
      }
    }

    if(message) {
      // ! гений в деле, костылируем (но это гениально)
      const messagePhoto = message.action.photo;
      if(messagePhoto.id !== photo.id) {
        if(!hadMessage) {
          message = appMessagesManager.generateFakeAvatarMessage(peerId, photo);
        } else {
          
        }
      }

      const f = (arr: typeof prevTargets) => arr.map(el => ({
        element: el.element,
        mid: (el.item as Message.messageService).mid,
        peerId: (el.item as Message.messageService).peerId
      }));

      new AppMediaViewer()
      .setSearchContext({
        peerId,
        inputFilter,
      })
      .openMedia(message, getTarget(), undefined, undefined, prevTargets ? f(prevTargets) : undefined, nextTargets ? f(nextTargets) : undefined);

      return;
    }
  }

  if(photo) {
    if(typeof(message) === 'string') {
      photo = appPhotosManager.getPhoto(message);
    }
    
    const f = (arr: typeof prevTargets) => arr.map(el => ({
      element: el.element,
      photoId: el.item as string
    }));

    new AppMediaViewerAvatar(peerId).openMedia(photo.id, getTarget(), undefined, prevTargets ? f(prevTargets) : undefined, nextTargets ? f(nextTargets) : undefined);
  }
}

export default class AvatarElement extends HTMLElement {
  private peerId: number;
  private isDialog = false;
  public peerTitle: string;
  public loadPromises: Promise<any>[];
  //public lazyLoadQueue: LazyLoadQueueIntersector;
  //private addedToQueue = false;

  constructor() {
    super();
    // элемент создан
  }

  connectedCallback() {
    // браузер вызывает этот метод при добавлении элемента в документ
    // (может вызываться много раз, если элемент многократно добавляется/удаляется)

    this.isDialog = !!this.getAttribute('dialog');
    if(this.getAttribute('clickable') === '') {
      this.setAttribute('clickable', 'set');
      let loading = false;
      attachClickEvent(this, async(e) => {
        cancelEvent(e);
        if(loading) return;
        //console.log('avatar clicked');
        const peerId = this.peerId;
        loading = true;
        await openAvatarViewer(this, this.peerId, () => this.peerId === peerId);
        loading = false;
      });
    }
  }

  /* disconnectedCallback() {
    // браузер вызывает этот метод при удалении элемента из документа
    // (может вызываться много раз, если элемент многократно добавляется/удаляется)
    if(this.lazyLoadQueue) {
      this.lazyLoadQueue.unobserve(this);
    }
  } */

  static get observedAttributes(): string[] {
    return ['peer', 'dialog', 'peer-title'/* массив имён атрибутов для отслеживания их изменений */];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    //console.log('avatar changed attribute:', name, oldValue, newValue);
    // вызывается при изменении одного из перечисленных выше атрибутов
    if(name === 'peer') {
      if(this.peerId === +newValue) {
        return;
      }
      
      this.peerId = appPeersManager.getPeerMigratedTo(+newValue) || +newValue;
      this.update();
    } else if(name === 'peer-title') {
      this.peerTitle = newValue;
    } else if(name === 'dialog') {
      this.isDialog = !!+newValue;
    }
  }

  public update() {
    /* if(this.lazyLoadQueue) {
      if(this.addedToQueue) return;
      this.lazyLoadQueue.push({
        div: this, 
        load: () => {
          return appProfileManager.putPhoto(this, this.peerId, this.isDialog, this.peerTitle).finally(() => {
            this.addedToQueue = false;
          });
        }
      });
      this.addedToQueue = true;
    } else { */
      const res = appProfileManager.putPhoto(this, this.peerId, this.isDialog, this.peerTitle);
      if(this.loadPromises && res && res.cached) {
        this.loadPromises.push(res.loadPromise);
        res.loadPromise.finally(() => {
          this.loadPromises = undefined;
        });
      }
    //}
  }
}

customElements.define("avatar-element", AvatarElement);
