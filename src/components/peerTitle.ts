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
import generateTitleIcons from "./generateTitleIcons";

export type PeerTitleOptions = {
  peerId?: PeerId,
  fromName?: string,
  plainText?: boolean,
  onlyFirstName?: boolean,
  dialog?: boolean,
  limitSymbols?: number,
  managers?: AppManagers,
  withIcons?: boolean
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
  private hasInner: boolean;
  private withIcons: boolean;

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

    this.peerId ??= NULL_PEER_ID;

    let hasInner: boolean;
    if(this.peerId !== rootScope.myId || !this.dialog) {
      const managers = this.managers ?? rootScope.managers;
      const [title, icons] = await Promise.all([
        getPeerTitle(this.peerId, this.plainText, this.onlyFirstName, this.limitSymbols, managers),
        this.withIcons && generateTitleIcons(this.peerId)
      ]);

      if(icons?.length) {
        const inner = document.createElement('span');
        inner.classList.add('peer-title-inner');
        hasInner = true;
        setInnerHTML(inner, title);
        
        const fragment = document.createDocumentFragment();
        fragment.append(inner, ...icons);
        setInnerHTML(this.element, fragment);
      } else {
        setInnerHTML(this.element, title);
      }
    } else {
      replaceContent(this.element, i18n(this.onlyFirstName ? 'Saved' : 'SavedMessages'));
    }

    if(this.hasInner !== hasInner) {
      this.hasInner = hasInner;
      this.element.classList.toggle('with-icons', hasInner);
    }
  }
}
