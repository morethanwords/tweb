/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import AppSelectPeers from '../appSelectPeers';
import PopupElement from '.';
import {LangPackKey} from '../../lib/langPack';

import {toastNew} from "../toast";

import {CommentSection} from "./popupCommentSection";

export default class PopupPickUser extends PopupElement {
  protected selector: AppSelectPeers;
  private commentSection: CommentSection;

  constructor(options: {
    peerTypes: AppSelectPeers['peerType'],
    onSelect?: (peerId: PeerId) => Promise<void> | void,
    onSelectMultiple?: (peerIds: PeerId[], message: string) => Promise<void> | void,
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
        if(!this.selector.toggleableMultiSelect || (this.selector.toggleableMultiSelect && !this.selector.toggleableMultiSelectState)) {
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
        } else {
          if(options.onSelectMultiple) {
            const peerIds = selected.map(peer => peer.toPeerId());
            const submitForward = async(message: string) => {
              if(peerIds.length) {
                const res = options.onSelectMultiple(peerIds, message);
                if(res instanceof Promise) {
                  try {
                    await res;
                  } catch(err) {
                    return;
                  }
                }
                this.selector = null;
                this.hide();
              } else {
                toastNew({langPackKey: 'SelectRecipient'});
              }
            }

            if(!this.commentSection) {
              this.commentSection = new CommentSection({
                container: this.container,
                onSubmit: submitForward,
                managers: this.managers,
                scrollable: this.scrollable
              });
              this.commentSection.construct();
            } else {
              this.commentSection.onSubmit = submitForward;
            }
          }
        }


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
      multiSelect: true,
      toggleableMultiSelect: true,
      rippleEnabled: false,
      avatarSize: 'abitbigger',
      peerId: options.peerId,
      placeholder: options.placeholder,
      selfPresence: options.selfPresence,
      managers: this.managers,
    });

    this.scrollable = this.selector.scrollable;
    this.attachScrollableListeners();

    this.title.append(this.selector.input);
  }
}

