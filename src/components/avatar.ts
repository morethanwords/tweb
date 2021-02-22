import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appProfileManager from "../lib/appManagers/appProfileManager";
import rootScope from "../lib/rootScope";
import { attachClickEvent, cancelEvent } from "../helpers/dom";
import AppMediaViewer, { AppMediaViewerAvatar } from "./appMediaViewer";
import { Photo } from "../layer";
import appPeersManager from "../lib/appManagers/appPeersManager";
//import type { LazyLoadQueueIntersector } from "./lazyLoadQueue";

rootScope.on('avatar_update', (e) => {
  let peerId = e;

  appProfileManager.removeFromAvatarsCache(peerId);
  (Array.from(document.querySelectorAll('avatar-element[peer="' + peerId + '"]')) as AvatarElement[]).forEach(elem => {
    //console.log('updating avatar:', elem);
    elem.update();
  });
}); 

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

        const photo = await appProfileManager.getFullPhoto(this.peerId);
        if(this.peerId !== peerId || !photo) {
          loading = false;
          return;
        }

        if(peerId < 0) {
          const maxId = Number.MAX_SAFE_INTEGER;
          const inputFilter = 'inputMessagesFilterChatPhotos';
          let message: any = await appMessagesManager.getSearch({
            peerId, 
            inputFilter: {_: inputFilter}, 
            maxId, 
            limit: 2, 
            backLimit: 1
          }).then(value => {
            //console.log(lol);
            // ! by descend
            return value.history[0];
          });

          if(message) {
            // ! гений в деле, костылируем (но это гениально)
            const messagePhoto = message.action.photo;
            if(messagePhoto.id !== photo.id) {
              message = {
                _: 'message',
                mid: maxId,
                media: {
                  _: 'messageMediaPhoto',
                  photo: photo
                },
                peerId,
                date: (photo as Photo.photo).date,
                fromId: peerId
              };

              appMessagesManager.getMessagesStorage(peerId)[maxId] = message;
            }

            const good = Array.from(this.querySelectorAll('img')).find(img => !img.classList.contains('emoji'));
            new AppMediaViewer()
            .setSearchContext({
              peerId,
              inputFilter,
            })
            .openMedia(message, good ? this : null);
            loading = false;
            return;
          }
        }

        if(photo) {
          const good = Array.from(this.querySelectorAll('img')).find(img => !img.classList.contains('emoji'));
          new AppMediaViewerAvatar(peerId).openMedia(photo.id, good ? this : null);
        }

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