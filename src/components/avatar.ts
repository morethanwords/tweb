import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appProfileManager from "../lib/appManagers/appProfileManager";
import $rootScope from "../lib/rootScope";
import { cancelEvent } from "../lib/utils";
import AppMediaViewer, { AppMediaViewerAvatar } from "./appMediaViewer";

$rootScope.$on('avatar_update', (e) => {
  let peerID = e.detail;

  appProfileManager.removeFromAvatarsCache(peerID);
  (Array.from(document.querySelectorAll('avatar-element[peer="' + peerID + '"]')) as AvatarElement[]).forEach(elem => {
    //console.log('updating avatar:', elem);
    elem.update();
  });
}); 

export default class AvatarElement extends HTMLElement {
  private peerID: number;
  private isDialog = false;
  public peerTitle: string;

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
      this.addEventListener('click', async(e) => {
        cancelEvent(e);
        if(loading) return;
        //console.log('avatar clicked');
        const peerID = this.peerID;
        loading = true;

        const photo = await appProfileManager.getFullPhoto(this.peerID);
        if(this.peerID != peerID || !photo) {
          loading = false;
          return;
        }

        if(peerID < 0) {
          const maxID = Number.MAX_SAFE_INTEGER;
          const inputFilter = 'inputMessagesFilterChatPhotos';
          const mid = await appMessagesManager.getSearch(peerID, '', {_: inputFilter}, maxID, 2, 0, 1).then(value => {
            //console.log(lol);
            // ! by descend
            return value.history[0];
          });

          if(mid) {
            // ! гений в деле, костылируем (но это гениально)
            let message = appMessagesManager.getMessage(mid);
            const messagePhoto = message.action.photo;
            if(messagePhoto.id != photo.id) {
              message = {
                _: 'message',
                mid: maxID,
                media: {
                  _: 'messageMediaPhoto',
                  photo: photo
                },
                fromID: peerID
              };

              appMessagesManager.messagesStorage[maxID] = message;
            }

            const good = Array.from(this.querySelectorAll('img')).find(img => !img.classList.contains('emoji'));
            new AppMediaViewer(inputFilter).openMedia(message, good ? this : null);
            loading = false;
            return;
          }
        }

        if(photo) {
          const good = Array.from(this.querySelectorAll('img')).find(img => !img.classList.contains('emoji'));
          new AppMediaViewerAvatar(peerID).openMedia(photo.id, good ? this : null);
        }

        loading = false;
      });
    }
  }

  //disconnectedCallback() {
    // браузер вызывает этот метод при удалении элемента из документа
    // (может вызываться много раз, если элемент многократно добавляется/удаляется)
  //}

  static get observedAttributes(): string[] {
    return ['peer', 'dialog', 'peer-title'/* массив имён атрибутов для отслеживания их изменений */];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    //console.log('avatar changed attribute:', name, oldValue, newValue);
    // вызывается при изменении одного из перечисленных выше атрибутов
    if(name == 'peer') {
      if(this.peerID == +newValue) {
        return;
      }
      
      this.peerID = +newValue;
      this.update();
    } else if(name == 'peer-title') {
      this.peerTitle = newValue;
    } else if(name == 'dialog') {
      this.isDialog = !!+newValue;
    }
  }

  public update() {
    appProfileManager.putPhoto(this, this.peerID, this.isDialog, this.peerTitle);
  }

  adoptedCallback() {
    // вызывается, когда элемент перемещается в новый документ
    // (происходит в document.adoptNode, используется очень редко)
  }

  // у элемента могут быть ещё другие методы и свойства
}

customElements.define("avatar-element", AvatarElement);