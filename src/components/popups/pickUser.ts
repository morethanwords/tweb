/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { isTouchSupported } from "../../helpers/touchSupport";
import AppSelectPeers from "../appSelectPeers";
import PopupElement from ".";
import { LangPackKey, _i18n } from "../../lib/langPack";

export default class PopupPickUser extends PopupElement {
  protected selector: AppSelectPeers;
  
  constructor(options: {
    peerTypes: AppSelectPeers['peerType'], 
    onSelect?: (peerId: number) => Promise<void> | void, 
    onClose?: () => void,
    placeholder: LangPackKey,
    chatRightsAction?: AppSelectPeers['chatRightsAction'],
    peerId?: number,
    selfPresence?: LangPackKey
  }) {
    super('popup-forward', null, {closable: true, overlayClosable: true, body: true});

    if(options.onClose) this.onClose = options.onClose;

    this.selector = new AppSelectPeers({
      appendTo: this.body, 
      onChange: async() => {
        const peerId = this.selector.getSelected()[0];
        
        this.selector = null;
        
        if(options.onSelect) {
          const res = options.onSelect(peerId);
          if(res instanceof Promise) {
            await res;
          }
        }
        
        this.hide();
      }, 
      peerType: options.peerTypes, 
      onFirstRender: () => {
        this.show();
        this.selector.checkForTriggers(); // ! due to zero height before mounting

        if(!isTouchSupported) {
          this.selector.input.focus();
        }
      }, 
      chatRightsAction: options.chatRightsAction, 
      multiSelect: false,
      rippleEnabled: false,
      avatarSize: 46,
      peerId: options.peerId,
      placeholder: options.placeholder,
      selfPresence: options.selfPresence
    });

    //this.scrollable = new Scrollable(this.body);

    this.title.append(this.selector.input);
  }
}
