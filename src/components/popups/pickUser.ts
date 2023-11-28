/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import AppSelectPeers, {SelectSearchPeerType} from '../appSelectPeers';
import PopupElement from '.';
import {LangPackKey, _i18n, i18n} from '../../lib/langPack';
import {Modify} from '../../types';
import {IsPeerType} from '../../lib/appManagers/appPeersManager';
import ButtonCorner from '../buttonCorner';
import {attachClickEvent} from '../../helpers/dom/clickEvent';

type PopupPickUserOptions = Modify<ConstructorParameters<typeof AppSelectPeers>[0], {
  multiSelect?: never,
  appendTo?: never,
  managers?: never,
  onSelect?: (peerId: PeerId) => Promise<void> | void,
  onMultiSelect?: (peerIds: PeerId[]) => Promise<void> | void,
  middleware?: never,
  titleLangKey?: LangPackKey,
  initial?: PeerId[]
}>;

export default class PopupPickUser extends PopupElement {
  public selector: AppSelectPeers;

  constructor(options: PopupPickUserOptions) {
    super(
      'popup-forward',
      {
        closable: true,
        overlayClosable: true,
        body: true,
        title: options.titleLangKey ?? true
        // withConfirm: options.onMultiSelect ? 'OK' : undefined
        // footer: !!options.onMultiSelect,
        // withConfirm: !!options.onMultiSelect
      }
    );

    const isMultiSelect = !!options.onMultiSelect;

    const onSelect = async(peerId: PeerId | PeerId[]) => {
      const callback = options.onSelect || options.onMultiSelect;
      if(callback) {
        const res = callback(peerId as any);
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
    };

    this.selector = new AppSelectPeers({
      ...options,
      middleware: this.middlewareHelper.get(),
      appendTo: this.body,
      onChange: isMultiSelect ? (length) => {
        this.btnConfirm.classList.toggle('is-visible', !!length);
      } : undefined,
      onSelect: isMultiSelect ? undefined : onSelect,
      onFirstRender: () => {
        this.show();
        this.selector.checkForTriggers(); // ! due to zero height before mounting

        if(!IS_TOUCH_SUPPORTED) {
          this.selector.input.focus();
        }
      },
      multiSelect: isMultiSelect,
      rippleEnabled: false,
      avatarSize: 'abitbigger',
      managers: this.managers,
      night: this.night,
      headerSearch: isMultiSelect
    });

    this.scrollable = this.selector.scrollable;

    if(isMultiSelect) {
      this.header.after(this.selector.searchSection.container);
      // this.btnConfirm.append(i18n('OK'));
      // this.footer.append(this.btnConfirm);
      // this.body.after(this.footer);
      // this.footer.classList.add('abitlarger');

      this.btnConfirm = this.btnConfirmOnEnter = ButtonCorner({icon: 'check'});
      this.body.append(this.btnConfirm);

      attachClickEvent(this.btnConfirm, () => {
        onSelect(this.selector.getSelected() as PeerId[]);
      }, {listenerSetter: this.listenerSetter});

      if(options.initial) {
        this.selector.addInitial(options.initial);
      }
    } else {
      this.title.append(this.selector.input);
      this.attachScrollableListeners();
    }
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

  public static createSharingPicker(options: {
    onSelect: ConstructorParameters<typeof PopupPickUser>[0]['onSelect'],
    chatRightsActions?: PopupPickUserOptions['chatRightsActions'],
    placeholder?: LangPackKey,
    selfPresence?: LangPackKey
  }) {
    options.chatRightsActions ??= ['send_plain'];
    options.placeholder ??= 'ShareModal.Search.Placeholder';
    options.selfPresence ??= 'ChatYourSelf';
    return PopupElement.createPopup(PopupPickUser, {
      ...options,
      peerType: ['dialogs', 'contacts']
    });
  }

  public static createSharingPicker2(options?: Modify<Parameters<typeof PopupPickUser['createSharingPicker']>[0], {onSelect?: never}>) {
    return new Promise<PeerId>((resolve, reject) => {
      let resolved = false;
      const popup = PopupPickUser.createSharingPicker({
        ...(options || {}),
        onSelect: (peerId) => {
          resolved = true;
          resolve(peerId);
        }
      });
      popup.addEventListener('close', () => {
        if(!resolved) {
          reject();
        }
      });
    });
  }

  public static createReplyPicker() {
    return this.createSharingPicker2({
      placeholder: 'ReplyToDialog',
      selfPresence: 'SavedMessagesInfoQuote'
    });
  }
}
