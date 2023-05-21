/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import AppSelectPeers, {SelectSearchPeerType} from '../appSelectPeers';
import PopupElement from '.';
import {_i18n} from '../../lib/langPack';
import {Modify} from '../../types';
import {IsPeerType} from '../../lib/appManagers/appPeersManager';

type PopupPickUserOptions = Modify<ConstructorParameters<typeof AppSelectPeers>[0], {
  multiSelect?: never,
  appendTo?: never,
  managers?: never,
  onSelect?: (peerId: PeerId) => Promise<void> | void,
  middleware?: never
}>;

export default class PopupPickUser extends PopupElement {
  public selector: AppSelectPeers;

  constructor(options: PopupPickUserOptions) {
    super('popup-forward', {closable: true, overlayClosable: true, body: true, title: true});

    this.selector = new AppSelectPeers({
      ...options,
      middleware: this.middlewareHelper.get(),
      appendTo: this.body,
      onSelect: async(peerId) => {
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
      onFirstRender: () => {
        this.show();
        this.selector.checkForTriggers(); // ! due to zero height before mounting

        if(!IS_TOUCH_SUPPORTED) {
          this.selector.input.focus();
        }
      },
      multiSelect: false,
      rippleEnabled: false,
      avatarSize: 'abitbigger',
      managers: this.managers
    });

    this.scrollable = this.selector.scrollable;
    this.attachScrollableListeners();

    // this.scrollable = new Scrollable(this.body);

    this.title.append(this.selector.input);
  }

  protected destroy() {
    super.destroy();
    this.selector?.destroy();
    this.selector = undefined;
  }

  public static async createPicker2({
    peerType,
    filterPeerTypeBy,
    chatRightsActions
  }: {
    peerType?: SelectSearchPeerType[],
    filterPeerTypeBy: AppSelectPeers['filterPeerTypeBy'],
    chatRightsActions?: PopupPickUserOptions['chatRightsActions']
  }) {
    return new Promise<PeerId>((resolve, reject) => {
      let resolved = false;
      const popup = PopupElement.createPopup(PopupPickUser, {
        peerType,
        placeholder: 'SelectChat',
        onSelect: (peerId) => {
          resolve(peerId);
          resolved = true;
        },
        filterPeerTypeBy,
        chatRightsActions
      });

      popup.addEventListener('close', () => {
        if(!resolved) {
          reject();
        }
      }, {once: true});
    });
  }

  public static async createPicker(
    types: Parameters<typeof AppSelectPeers['convertPeerTypes']>[0] = ['users', 'bots', 'groups', 'channels'],
    chatRightsActions?: PopupPickUserOptions['chatRightsActions']
  ) {
    if(!Array.isArray(types)) {
      types = [];
    }

    const filterPeerTypeBy: IsPeerType[] = AppSelectPeers.convertPeerTypes(types);
    const peerType: SelectSearchPeerType[] = ['dialogs'];
    if(types.includes('users')) peerType.push('contacts');

    if(!filterPeerTypeBy.length) {
      throw undefined;
    }

    return this.createPicker2({peerType, filterPeerTypeBy, chatRightsActions});
  }

  public static createSharingPicker(onSelect: ConstructorParameters<typeof PopupPickUser>[0]['onSelect']) {
    PopupElement.createPopup(PopupPickUser, {
      peerType: ['dialogs', 'contacts'],
      onSelect,
      placeholder: 'ShareModal.Search.Placeholder',
      chatRightsActions: ['send_plain'],
      selfPresence: 'ChatYourSelf'
    });
  }
}
