/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appProfileManager from "../lib/appManagers/appProfileManager";
import rootScope from "../lib/rootScope";
import { Message, Photo } from "../layer";
import appPeersManager from "../lib/appManagers/appPeersManager";
import appPhotosManager from "../lib/appManagers/appPhotosManager";
import type { LazyLoadQueueIntersector } from "./lazyLoadQueue";
import { attachClickEvent } from "../helpers/dom/clickEvent";
import { cancelEvent } from "../helpers/dom/cancelEvent";
import appAvatarsManager from "../lib/appManagers/appAvatarsManager";
import AppMediaViewer from "./appMediaViewer";
import AppMediaViewerAvatar from "./appMediaViewerAvatar";
import { NULL_PEER_ID } from "../lib/mtproto/mtproto_config";
import isObject from "../helpers/object/isObject";

const onAvatarUpdate = (peerId: PeerId) => {
  appAvatarsManager.removeFromAvatarsCache(peerId);
  (Array.from(document.querySelectorAll('avatar-element[peer="' + peerId + '"]')) as AvatarElement[]).forEach(elem => {
    //console.log('updating avatar:', elem);
    elem.update();
  });
};

rootScope.addEventListener('avatar_update', onAvatarUpdate);
rootScope.addEventListener('peer_title_edit', (peerId) => {
  if(!appAvatarsManager.isAvatarCached(peerId)) {
    onAvatarUpdate(peerId);
  }
});

export async function openAvatarViewer(
  target: HTMLElement, 
  peerId: PeerId, 
  middleware: () => boolean, 
  message?: any, 
  prevTargets?: {element: HTMLElement, item: Photo.photo['id'] | Message.messageService}[], 
  nextTargets?: typeof prevTargets
) {
  let photo = await appProfileManager.getFullPhoto(peerId);
  if(!middleware() || !photo) {
    return;
  }

  const getTarget = () => {
    const good = Array.from(target.querySelectorAll('img')).find(img => !img.classList.contains('emoji'));
    return good ? target : null;
  };

  if(peerId.isAnyChat()) {
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
        inputFilter: {_: inputFilter},
      })
      .openMedia(message, getTarget(), undefined, undefined, prevTargets ? f(prevTargets) : undefined, nextTargets ? f(nextTargets) : undefined);

      return;
    }
  }

  if(photo) {
    if(!isObject(message) && message) {
      photo = appPhotosManager.getPhoto(message);
    }
    
    const f = (arr: typeof prevTargets) => arr.map(el => ({
      element: el.element,
      photoId: el.item as string
    }));

    new AppMediaViewerAvatar(peerId).openMedia(photo.id, getTarget(), undefined, prevTargets ? f(prevTargets) : undefined, nextTargets ? f(nextTargets) : undefined);
  }
}

const believeMe: Map<PeerId, Set<AvatarElement>> = new Map();
const seen: Set<PeerId> = new Set();

export default class AvatarElement extends HTMLElement {
  private peerId: PeerId;
  private isDialog: boolean;
  private peerTitle: string;
  public loadPromises: Promise<any>[];
  public lazyLoadQueue: LazyLoadQueueIntersector;
  public isBig: boolean;
  private addedToQueue = false;

  connectedCallback() {
    // браузер вызывает этот метод при добавлении элемента в документ
    // (может вызываться много раз, если элемент многократно добавляется/удаляется)

    this.isDialog = this.getAttribute('dialog') === '1';
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

  disconnectedCallback() {
    // браузер вызывает этот метод при удалении элемента из документа
    // (может вызываться много раз, если элемент многократно добавляется/удаляется)
    const set = believeMe.get(this.peerId);
    if(set && set.has(this)) {
      set.delete(this);
      if(!set.size) {
        believeMe.delete(this.peerId);
      }
    }

    if(this.lazyLoadQueue) {
      this.lazyLoadQueue.unobserve(this);
    }
  }

  static get observedAttributes(): string[] {
    return ['peer', 'dialog', 'peer-title'/* массив имён атрибутов для отслеживания их изменений */];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    //console.log('avatar changed attribute:', name, oldValue, newValue);
    // вызывается при изменении одного из перечисленных выше атрибутов
    if(name === 'peer') {
      const newPeerId = (newValue || '').toPeerId() || NULL_PEER_ID;
      if(this.peerId === newPeerId) {
        return;
      }
      
      this.peerId = appPeersManager.getPeerMigratedTo(newPeerId) || newPeerId;

      const wasPeerId = (oldValue || '').toPeerId() || NULL_PEER_ID;
      if(wasPeerId) {
        const set = believeMe.get(wasPeerId);
        if(set) {
          set.delete(this);
          if(!set.size) {
            believeMe.delete(wasPeerId);
          }
        }
      }

      this.update();
    } else if(name === 'peer-title') {
      this.peerTitle = newValue;
    } else if(name === 'dialog') {
      this.isDialog = newValue === '1';
    }
  }

  private r(onlyThumb = false) {
    const res = appAvatarsManager.putPhoto(this, this.peerId, this.isDialog, this.peerTitle, onlyThumb, this.isBig);
    const promise = res ? res.loadPromise : Promise.resolve();
    if(this.loadPromises) {
      if(res && res.cached) {
        this.loadPromises.push(promise);
      }

      promise.finally(() => {
        this.loadPromises = undefined;
      });
    }

    return res;
  }

  public update() {
    if(this.lazyLoadQueue) {
      if(!seen.has(this.peerId)) {
        if(this.addedToQueue) return;
        this.addedToQueue = true;
        
        let set = believeMe.get(this.peerId);
        if(!set) {
          set = new Set();
          believeMe.set(this.peerId, set);
        }
  
        set.add(this);

        this.r(true);

        this.lazyLoadQueue.push({
          div: this, 
          load: () => {
            seen.add(this.peerId);
            return this.update();
          }
        });

        return;
      } else if(this.addedToQueue) {
        this.lazyLoadQueue.unobserve(this);
      }
    } 
    
    seen.add(this.peerId);
    
    const res = this.r();
    const promise = res ? res.loadPromise : Promise.resolve();

    if(this.addedToQueue) {
      promise.finally(() => {
        this.addedToQueue = false;
      });
    }

    const set = believeMe.get(this.peerId);
    if(set) {
      set.delete(this);
      const arr = Array.from(set);
      believeMe.delete(this.peerId);
      

      for(let i = 0, length = arr.length; i < length; ++i) {
        arr[i].update();
      }
    }

    return promise;
  }
}

customElements.define('avatar-element', AvatarElement);
