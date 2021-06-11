/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appProfileManager from "../lib/appManagers/appProfileManager";
import rootScope from "../lib/rootScope";
import AppMediaViewer, { AppMediaViewerAvatar } from "./appMediaViewer";
import { Message } from "../layer";
import appPeersManager from "../lib/appManagers/appPeersManager";
import appPhotosManager from "../lib/appManagers/appPhotosManager";
import type { LazyLoadQueueIntersector } from "./lazyLoadQueue";
import { attachClickEvent } from "../helpers/dom/clickEvent";
import { cancelEvent } from "../helpers/dom/cancelEvent";

const onAvatarUpdate = (peerId: number) => {
  appProfileManager.removeFromAvatarsCache(peerId);
  (Array.from(document.querySelectorAll('avatar-element[peer="' + peerId + '"]')) as AvatarElement[]).forEach(elem => {
    //console.log('updating avatar:', elem);
    elem.update();
  });
};

rootScope.addEventListener('avatar_update', onAvatarUpdate);
rootScope.addEventListener('peer_title_edit', onAvatarUpdate);

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

const believeMe: Map<number, Set<AvatarElement>> = new Map();
const seen: Set<number> = new Set();

export default class AvatarElement extends HTMLElement {
  private peerId: number;
  private isDialog = false;
  private peerTitle: string;
  public loadPromises: Promise<any>[];
  public lazyLoadQueue: LazyLoadQueueIntersector;
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
      if(this.peerId === +newValue) {
        return;
      }
      
      this.peerId = appPeersManager.getPeerMigratedTo(+newValue) || +newValue;

      const wasPeerId = +oldValue;
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
    const res = appProfileManager.putPhoto(this, this.peerId, this.isDialog, this.peerTitle, onlyThumb);
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
