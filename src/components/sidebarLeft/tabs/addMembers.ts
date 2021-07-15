/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SliderSuperTab } from "../../slider";
import AppSelectPeers from "../../appSelectPeers";
import { putPreloader, setButtonLoader } from "../../misc";
import { LangPackKey, _i18n } from "../../../lib/langPack";
import ButtonCorner from "../../buttonCorner";

export default class AppAddMembersTab extends SliderSuperTab {
  private nextBtn: HTMLButtonElement;
  private selector: AppSelectPeers;
  private peerType: 'channel' | 'chat' | 'privacy';
  private takeOut: (peerIds: number[]) => Promise<any> | false | void;
  private skippable: boolean;

  protected init() {
    this.nextBtn = ButtonCorner({icon: 'arrow_next'});
    this.content.append(this.nextBtn);
    this.scrollable.container.remove();
    
    this.nextBtn.addEventListener('click', () => {
      const peerIds = this.selector.getSelected();

      if(this.skippable) {
        this.takeOut(peerIds);
        this.close();
      } else {
        const promise = this.takeOut(peerIds);

        if(promise instanceof Promise) {
          this.attachToPromise(promise);
        } else if(promise === undefined) {
          this.close();
        }
      }
    });
  }

  public attachToPromise(promise: Promise<any>) {
    const removeLoader = setButtonLoader(this.nextBtn, 'arrow_next');

    promise.then(() => {
      this.close();
    }, () => {
      removeLoader();
    });
  }

  public open(options: {
    title: LangPackKey,
    placeholder: LangPackKey,
    peerId?: number, 
    type: AppAddMembersTab['peerType'], 
    takeOut?: AppAddMembersTab['takeOut'],
    skippable: boolean,
    selectedPeerIds?: number[]
  }) {
    const ret = super.open();

    this.setTitle(options.title);
    this.peerType = options.type;
    this.takeOut = options.takeOut;
    this.skippable = options.skippable;

    this.selector = new AppSelectPeers({
      appendTo: this.content, 
      onChange: this.skippable ? null : (length) => {
        this.nextBtn.classList.toggle('is-visible', !!length);
      }, 
      peerType: ['contacts'],
      placeholder: options.placeholder
    });

    if(options.selectedPeerIds) {
      this.selector.addInitial(options.selectedPeerIds);
    }

    this.nextBtn.classList.add('tgico-arrow_next');
    this.nextBtn.innerHTML = '';
    this.nextBtn.disabled = false;
    this.nextBtn.classList.toggle('is-visible', this.skippable);

    return ret;
  }
}