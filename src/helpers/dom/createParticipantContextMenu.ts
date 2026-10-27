import createContextMenu from '@helpers/dom/createContextMenu';
import findUpClassName from '@helpers/dom/findUpClassName';
import {ChannelParticipant, Chat, ChatParticipant} from '@layer';
import SidebarSlider from '@components/slider';
import rootScope from '@lib/rootScope';
import canEditAdmin from '@appManagers/utils/chats/canEditAdmin';
import {Middleware} from '@helpers/middleware';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import {handleMissingInvitees} from '@components/addChatUsers';
import {isParticipantAdmin, isParticipantCreator} from '@lib/appManagers/utils/chats/isParticipantAdmin';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {canEditMemberTag} from '@appManagers/utils/chats/memberTag';
import openEditMemberTag from '@components/memberTag/openEditMemberTag';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

type Participant = ChannelParticipant | ChatParticipant;

type BannedParticipantAdapter = {
  hasRights: () => MaybePromise<boolean>,
  unban: (
    participantPeerId: PeerId,
    participant: Participant
  ) => MaybePromise<void>
};

export default function createParticipantContextMenu(options: {
  listenTo: HTMLElement,
  appendTo?: HTMLElement,
  onOpen?: () => any,
  onClose?: () => any,
  slider: SidebarSlider,
  chatId: ChatId,
  participants: Map<PeerId, Participant>,
  middleware?: Middleware,
  bannedParticipantAdapter?: BannedParticipantAdapter
}) {
  const {
    listenTo,
    appendTo,
    onOpen,
    onClose,
    slider,
    chatId,
    participants,
    middleware,
    bannedParticipantAdapter
  } = options;
  let target: HTMLElement,
    participant: Participant,
    participantPeerId: PeerId,
    chat: Chat.chat | Chat.channel,
    isBroadcast: boolean,
    isBanned: boolean,
    canChangePermissions: boolean,
    canManageAdmins: boolean;

  const openPermissions = (isAdmin?: boolean) => {
    hotReloadGuard.tabs.openUserPermissionsTab(slider, chatId, participant, isAdmin);
  };

  function getButtons(): ButtonMenuItemOptionsVerifiable[] {
    return [{
      icon: 'message',
      text: 'SendMessage',
      onClick: () => {
        hotReloadGuard.appImManager.setInnerPeer({peerId: participantPeerId});
      }
    }, {
      // * "Add tag" / "Edit tag" on my own row, "Add member tag" / "Edit member tag" on another's
      icon: (participant as ChannelParticipant.channelParticipant)?.rank ? 'edit' : 'tag_add',
      text: participantPeerId === rootScope.myId ?
        ((participant as ChannelParticipant.channelParticipant)?.rank ? 'MemberTag.EditMine' : 'MemberTag.AddMine') :
        ((participant as ChannelParticipant.channelParticipant)?.rank ? 'MemberTag.EditMember' : 'MemberTag.AddMember'),
      onClick: () => openEditMemberTag(chatId, participantPeerId, participant),
      // * a restricted member is still one; whoever has left the group has no tag to set
      verify: () => !bannedParticipantAdapter &&
        !(participant?._ === 'channelParticipantBanned' && participant.pFlags.left) &&
        canEditMemberTag(chat, participantPeerId, rootScope.myId, participant)
    }, {
      icon: 'adduser',
      text: isBroadcast ? 'AddToChannel' : 'AddToGroup',
      onClick: () => {
        if(isBanned) {
          rootScope.managers.appChatsManager.addToChat(chatId, participantPeerId)
          .then((missingInvitees) => {
            handleMissingInvitees(chatId, missingInvitees);
          });
        }
      },
      verify: () => {
        if(bannedParticipantAdapter || !isBanned) {
          return false;
        }

        return true;
      }
    }, {
      icon: 'promote',
      text: 'SetAsAdmin',
      onClick: () => openPermissions(true),
      verify: () => !bannedParticipantAdapter &&
        canManageAdmins &&
        !isParticipantAdmin(participant)
    }, {
      icon: 'admin',
      text: 'EditAdminRights',
      onClick: () => openPermissions(true),
      verify: () => !bannedParticipantAdapter &&
        isParticipantAdmin(participant) &&
        canEditAdmin(
          chat,
          participant as ChannelParticipant,
          rootScope.myId
        )
    }, {
      icon: 'restrict',
      text: 'KickFromSupergroup',
      onClick: () => openPermissions(false),
      verify: () => !bannedParticipantAdapter &&
        canChangePermissions && (
        participant._ === 'channelParticipant' ||
        participant._ === 'chatParticipant' ||
        (participant._ === 'channelParticipantBanned' && !participant.pFlags.left)
      )
    }, {
      icon: 'delete',
      text: 'Delete',
      onClick: () => {
        if(isBanned) {
          if(bannedParticipantAdapter) {
            return bannedParticipantAdapter.unban(
              participantPeerId,
              participant
            );
          }

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
      verify: () => !bannedParticipantAdapter &&
        canChangePermissions &&
        participantPeerId !== rootScope.myId &&
        !isParticipantCreator(participant) &&
        (!isParticipantAdmin(participant) || canEditAdmin(chat, participant, rootScope.myId)) &&
        (participant._ === 'channelParticipant' || !isBanned)
    }];
  }

  const buttons: ButtonMenuItemOptionsVerifiable[] = [];
  return createContextMenu({
    listenTo: listenTo,
    appendTo,
    middleware,
    findElement: (e) => target = findUpClassName(e.target, 'chatlist-chat'),
    onOpen: async() => {
      const managers = bindManagersToSession(rootScope.managers);
      participantPeerId = target.dataset.peerId.toPeerId();
      participant = participants.get(participantPeerId);
      if(bannedParticipantAdapter) {
        isBroadcast = false;
        canChangePermissions = await bannedParticipantAdapter.hasRights();
        canManageAdmins = false;
      } else {
        [chat, isBroadcast, canChangePermissions, canManageAdmins] = await Promise.all([
          managers.appChatsManager.getChat(chatId) as Promise<typeof chat>,
          managers.appChatsManager.isBroadcast(chatId),
          managers.appChatsManager.hasRights(chatId, 'change_permissions'),
          managers.appChatsManager.hasRights(chatId, 'change_permissions')
        ]);
      }

      target.classList.add('menu-open');
      isBanned = canChangePermissions && participant._ === 'channelParticipantBanned' && participant.pFlags.left;
      buttons.splice(0, Infinity, ...getButtons());
      return onOpen?.();
    },
    onClose: () => {
      target.classList.remove('menu-open');
      return onClose?.();
    },
    buttons
  });
}
