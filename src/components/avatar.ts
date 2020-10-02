import appProfileManager from "../lib/appManagers/appProfileManager";
import $rootScope from "../lib/rootScope";

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
  }

  disconnectedCallback() {
    // браузер вызывает этот метод при удалении элемента из документа
    // (может вызываться много раз, если элемент многократно добавляется/удаляется)
  }

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