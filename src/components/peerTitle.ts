/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from "../lib/rootScope";
import { i18n } from "../lib/langPack";
import replaceContent from "../helpers/dom/replaceContent";
import { NULL_PEER_ID } from "../lib/mtproto/mtproto_config";
import limitSymbols from "../helpers/string/limitSymbols";
import setInnerHTML from "../helpers/dom/setInnerHTML";
import { AppManagers } from "../lib/appManagers/managers";
import wrapEmojiText from "../lib/richTextProcessor/wrapEmojiText";
import getPeerTitle from "./wrappers/getPeerTitle";

export type PeerTitleOptions = {
  peerId?: PeerId,
  fromName?: string,
  plainText?: boolean,
  onlyFirstName?: boolean,
  dialog?: boolean,
  limitSymbols?: number,
  managers?: AppManagers
};

const weakMap: WeakMap<HTMLElement, PeerTitle> = new WeakMap();

rootScope.addEventListener('peer_title_edit', (peerId) => {
  const elements = Array.from(document.querySelectorAll(`.peer-title[data-peer-id="${peerId}"]`)) as HTMLElement[];
  elements.forEach((element) => {
    const peerTitle = weakMap.get(element);
    //console.log('in the summer silence i was doing nothing', peerTitle, peerId);

    if(peerTitle) {
      peerTitle.update();
    }
  });
});

export default class PeerTitle {
  public element: HTMLElement;
  public peerId: PeerId;
  private fromName: string;
  private plainText = false;
  private onlyFirstName = false;
  private dialog = false;
  private limitSymbols: number;
  private managers: AppManagers;

  constructor(options?: PeerTitleOptions) {
    this.element = document.createElement('span');
    this.element.classList.add('peer-title');
    this.element.setAttribute('dir', 'auto');

    if(options) {
      this.update(options);
    }
    
    weakMap.set(this.element, this);
  }

  public setOptions(options?: PeerTitleOptions) {
    if(!options) {
      return;
    }

    for(const i in options) {
      // @ts-ignore
      const value = options[i];

      if(typeof(value) !== 'object') {
        // @ts-ignore
        this.element.dataset[i] = value ? '' + (typeof(value) === 'boolean' ? +value : value) : '0';
      }

      // @ts-ignore
      this[i] = value;
    }
  }

  public async update(options?: PeerTitleOptions) {
    this.setOptions(options);

    let fromName = this.fromName;
    if(fromName !== undefined) {
      if(this.limitSymbols !== undefined) {
        fromName = limitSymbols(fromName, this.limitSymbols, this.limitSymbols);
      }

      setInnerHTML(this.element, wrapEmojiText(fromName));
      return;
    }

    if(this.peerId === undefined) {
      this.peerId = NULL_PEER_ID;
    }

    if(this.peerId !== rootScope.myId || !this.dialog) {
      const managers = this.managers ?? rootScope.managers;
      setInnerHTML(this.element, await getPeerTitle(this.peerId, this.plainText, this.onlyFirstName, this.limitSymbols, managers));
    } else {
      replaceContent(this.element, i18n(this.onlyFirstName ? 'Saved' : 'SavedMessages'));
    }
  }
}
