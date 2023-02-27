/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import AppSelectPeers from '../appSelectPeers';
import PopupElement from '.';
import {LangPackKey, _i18n} from '../../lib/langPack';

export default class PopupPickUser extends PopupElement {
  protected selector: AppSelectPeers;

  constructor(options: {
    peerTypes: AppSelectPeers['peerType'],
    onSelect?: (peerId: PeerId) => Promise<void> | void,
    placeholder: LangPackKey,
    chatRightsActions?: AppSelectPeers['chatRightsActions'],
    peerId?: number,
    selfPresence?: LangPackKey
  }) {
    super('popup-forward', {closable: true, overlayClosable: true, body: true, title: true});

    this.selector = new AppSelectPeers({
      appendTo: this.body,
      onChange: async() => {
        const selected = this.selector.getSelected();
        const peerId = selected[selected.length - 1].toPeerId();

        if(options.onSelect) {
          const res = options.onSelect(peerId);
          if(res instanceof Promise) {
            try {
              await res;
            } catch(err) {
              return;
            }
          }
        }

        this.selector = null;
        this.hide();
      },
      peerType: options.peerTypes,
      onFirstRender: () => {
        this.show();
        this.selector.checkForTriggers(); // ! due to zero height before mounting

        if(!IS_TOUCH_SUPPORTED) {
          this.selector.input.focus();
        }
      },
      chatRightsActions: options.chatRightsActions,
      multiSelect: false,
      rippleEnabled: false,
      avatarSize: 'abitbigger',
      peerId: options.peerId,
      placeholder: options.placeholder,
      selfPresence: options.selfPresence,
      managers: this.managers
    });

    this.scrollable = this.selector.scrollable;
    this.attachScrollableListeners();

    // this.scrollable = new Scrollable(this.body);

    this.title.append(this.selector.input);
  }
}
