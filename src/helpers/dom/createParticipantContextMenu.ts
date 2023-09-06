/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import createContextMenu from './createContextMenu';
import findUpClassName from './findUpClassName';
import {ChannelParticipant, Chat, ChatParticipant} from '../../layer';
import SidebarSlider from '../../components/slider';
import rootScope from '../../lib/rootScope';
import appImManager from '../../lib/appManagers/appImManager';
import canEditAdmin from '../../lib/appManagers/utils/chats/canEditAdmin';
import AppUserPermissionsTab from '../../components/sidebarRight/tabs/userPermissions';
import {Middleware} from '../middleware';

type Participant = ChannelParticipant | ChatParticipant;

export default function createParticipantContextMenu(options: {
  listenTo: HTMLElement,
  appendTo?: HTMLElement,
  onOpen?: () => any,
  onClose?: () => any,
  slider: SidebarSlider,
  chatId: ChatId,
  participants: Map<PeerId, Participant>,
  middleware?: Middleware
}) {
  const {listenTo, appendTo, onOpen, onClose, slider, chatId, participants, middleware} = options;
  let target: HTMLElement,
    participant: Participant,
    participantPeerId: PeerId,
    chat: Chat.chat | Chat.channel,
    isBroadcast: boolean,
    isBanned: boolean,
    canChangePermissions: boolean,
    canManageAdmins: boolean;

  const openPermissions = (isAdmin?: boolean) => {
    AppUserPermissionsTab.openTab(slider, chatId, participant, isAdmin);
  };

  return createContextMenu({
    listenTo: listenTo,
    appendTo,
    middleware,
    findElement: (e) => target = findUpClassName(e.target, 'chatlist-chat'),
    onOpen: async() => {
      participantPeerId = target.dataset.peerId.toPeerId();
      participant = participants.get(participantPeerId);
      [chat, isBroadcast, canChangePermissions, canManageAdmins] = await Promise.all([
        rootScope.managers.appChatsManager.getChat(chatId) as Promise<typeof chat>,
        rootScope.managers.appChatsManager.isBroadcast(chatId),
        rootScope.managers.appChatsManager.hasRights(chatId, 'change_permissions'),
        rootScope.managers.appChatsManager.hasRights(chatId, 'change_permissions')
      ]);

      target.classList.add('menu-open');
      isBanned = canChangePermissions && participant._ === 'channelParticipantBanned' && participant.pFlags.left;
      return onOpen?.();
    },
    onClose: () => {
      target.classList.remove('menu-open');
      return onClose?.();
    },
    buttons: [{
      icon: 'message',
      text: 'SendMessage',
      onClick: () => {
        appImManager.setInnerPeer({peerId: participantPeerId});
      }
    }, {
      icon: 'adduser',
      text: isBroadcast ? 'AddToChannel' : 'AddToGroup',
      onClick: () => {
        if(isBanned) {
          rootScope.managers.appChatsManager.addToChat(chatId, participantPeerId);
        }
      },
      verify: () => {
        if(!isBanned) {
          return false;
        }

        return true;
      }
    }, {
      icon: 'promote',
      text: 'SetAsAdmin',
      onClick: () => openPermissions(true),
      verify: () => canManageAdmins && participant._ === 'channelParticipant'
    }, {
      icon: 'admin',
      text: 'EditAdminRights',
      onClick: () => openPermissions(true),
      verify: () => participant._ === 'channelParticipantAdmin' && canEditAdmin(chat, participant as ChannelParticipant, rootScope.myId)
    }, {
      icon: 'restrict',
      text: 'KickFromSupergroup',
      onClick: () => openPermissions(false),
      verify: () => canChangePermissions && (participant._ === 'channelParticipant' || (participant._ === 'channelParticipantBanned' && !participant.pFlags.left))
    }, {
      icon: 'delete',
      text: 'Delete',
      onClick: () => {
        if(isBanned) {
          rootScope.managers.appChatsManager.editBanned(
            chatId,
            participant,
            {
              _: 'chatBannedRights',
              pFlags: {},
              until_date: 0
            }
          );
        }
      },
      verify: () => {
        if(!isBanned || !canChangePermissions || participantPeerId === rootScope.myId) {
          return false;
        }

        return true;
      }
    }, {
      icon: 'delete',
      text: 'KickFromGroup',
      onClick: () => {
        rootScope.managers.appChatsManager.kickFromChat(chatId, participantPeerId);
      },
      verify: () => canChangePermissions &&
        participantPeerId !== rootScope.myId &&
        participant._ !== 'channelParticipantCreator' &&
        (participant._ !== 'channelParticipantAdmin' || canEditAdmin(chat, participant, rootScope.myId)) &&
        (participant._ === 'channelParticipant' || !isBanned)
    }]
  });
}
