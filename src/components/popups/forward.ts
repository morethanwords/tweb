/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {ChatRights} from '../../lib/appManagers/appChatsManager';
import flatten from '../../helpers/array/flatten';
import appImManager from '../../lib/appManagers/appImManager';
import rootScope from '../../lib/rootScope';
import {toastNew} from '../toast';
import PopupPickUser from './pickUser';
import getMediaFromMessage from '../../lib/appManagers/utils/messages/getMediaFromMessage';
import PopupElement from '.';

export default class PopupForward extends PopupPickUser {
  constructor(
    peerIdMids?: {[fromPeerId: PeerId]: number[]},
    onSelect?: (peerId: PeerId) => Promise<void> | void,
    chatRightsAction: ChatRights[] = ['send_plain']
  ) {
    super({
      peerType: ['dialogs', 'contacts'],
      onSelect: !peerIdMids && onSelect ? onSelect : async(peerId) => {
        if(onSelect) {
          const res = onSelect(peerId);
          if(res instanceof Promise) {
            await res;
          }
        }

        if(peerId === rootScope.myId) {
          let count = 0;
          for(const fromPeerId in peerIdMids) {
            const mids = peerIdMids[fromPeerId];
            count += mids.length;
            this.managers.appMessagesManager.forwardMessages(peerId, fromPeerId.toPeerId(), mids);
          }

          toastNew({
            langPackKey: count > 0 ? 'FwdMessagesToSavedMessages' : 'FwdMessageToSavedMessages'
          });

          return;
        }

        await appImManager.setInnerPeer({peerId});
        appImManager.chat.input.initMessagesForward(peerIdMids);
      },
      placeholder: 'ShareModal.Search.ForwardPlaceholder',
      chatRightsActions: chatRightsAction,
      selfPresence: 'ChatYourSelf'
    });
  }

  public static async create(...args: ConstructorParameters<typeof PopupForward>) {
    const [peerIdMids] = args;
    const messagesPromises = Object.keys(peerIdMids).map((peerId) => {
      const mids = peerIdMids[peerId as any as number];
      return mids.map((mid) => {
        return rootScope.managers.appMessagesManager.getMessageByPeer(peerId.toPeerId(), mid);
      });
    });

    const messages = await Promise.all(flatten(messagesPromises));
    const actions: Set<ChatRights> = new Set();
    messages.forEach((message) => {
      if(!message) {
        return;
      }

      const media = getMediaFromMessage(message);
      let action: ChatRights;
      if(!media) {
        if(message.viaBotId) {
          action = 'send_inline';
        } else {
          action = 'send_plain';
        }
      } else {
        if(media._ === 'webPage') {
          action = 'embed_links';
        } else if(media._ === 'photo') {
          action = 'send_photos';
        } else if(media._ === 'game') {
          action = 'send_games';
        } else {
          switch(media.type) {
            case 'audio':
              action = 'send_audios';
              break;
            case 'gif':
              action = 'send_gifs';
              break;
            case 'round':
              action = 'send_roundvideos';
              break;
            case 'sticker':
              action = 'send_stickers';
              break;
            case 'voice':
              action = 'send_voices';
              break;
            case 'video':
              action = 'send_videos';
              break;
            default:
              action = 'send_docs';
              break;
          }
        }
      }

      if(action) {
        actions.add(action);
      }
    });

    PopupElement.createPopup(PopupForward, args[0], args[1], Array.from(actions));
  }
}
