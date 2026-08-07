import {Component} from 'solid-js';
import type {CommunityPermission} from '@appManagers/appCommunitiesManager';
import type {ChatRights} from '@appManagers/appChatsManager';
import {isParticipantCreator}
from '@appManagers/utils/chats/isParticipantAdmin';
import Button from '@components/button';
import confirmationPopup from '@components/confirmationPopup';
import useCommunityTabGuard
from '@components/communities/useCommunityTabGuard';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import SettingSection from '@components/settingSection';
import {
  type AdministratorRightsCheckboxFieldsField,
  ChatAdministratorRights,
  createSolidTabState
} from '@components/sidebarRight/tabs/groupPermissions/sharedPermissions';
import {usePromiseCollector}
from '@components/solidJsTabs/promiseCollector';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppUserPermissionsTab} from '@components/solidJsTabs/tabs';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import toggleDisability from '@helpers/dom/toggleDisability';
import copy from '@helpers/object/copy';
import type {ChannelParticipant, ChatAdminRights} from '@layer';
import type {LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import attachAdminRightsCaption from './attachAdminRightsCaption';
import appendPermissionsPeerDialog from './permissionsPeerDialog';

const COMMUNITY_ADMIN_RIGHT_OPTIONS: {
  flag: CommunityPermission,
  title: LangPackKey
}[] = [{
  flag: 'change_info',
  title: 'Community.AdminEditInfo'
}, {
  flag: 'manage_linked_peers',
  title: 'Community.AdminEditChats'
}, {
  flag: 'ban_users',
  title: 'Community.AdminBanMembers'
}, {
  flag: 'add_admins',
  title: 'Community.AdminAddAdmins'
}];

const CommunityUserPermissions: Component = () => {
  const [tab] = useSuperTab<typeof AppUserPermissionsTab>();
  const promiseCollector = usePromiseCollector();
  if(!('communityId' in tab.payload)) {
    return null;
  }

  const {
    communityId,
    participantId,
    participant,
    onUpdated
  } = tab.payload;
  useCommunityTabGuard(tab, communityId);

  let saveCallback: () => Promise<any>;
  const solidState = createSolidTabState<{
    rights: ChatAdminRights
  }>({
    tab,
    save: () => handleChannelsTooMuch(saveCallback),
    unsavedConfirmationProps: {}
  });

  tab.header.append(solidState.saveIcon());

  promiseCollector.collect((async() => {
    tab.container.classList.add(
      'edit-peer-container',
      'user-permissions-container'
    );

    let community = await tab.managers.appChatsManager.getChat(
      communityId
    );
    if(!community) {
      await tab.managers.appCommunitiesManager.reloadCommunity(communityId);
      community = await tab.managers.appChatsManager.getChat(
        communityId
      );
    }
    if(community?._ !== 'community' || !participantId.isUser()) {
      return;
    }

    const userId = participantId.toUserId();
    const user = await tab.managers.appUsersManager.getUser(userId);
    const originalRights = (
      participant?._ === 'channelParticipantAdmin' ||
      participant?._ === 'channelParticipantCreator'
    ) ? participant.admin_rights : undefined;
    const isCreator = isParticipantCreator(participant);
    const existingAdmin = participant?._ === 'channelParticipantAdmin' ?
      participant :
      undefined;
    const isSelf = (
      participant?._ === 'channelParticipantAdmin' &&
      !!participant.pFlags.self
    ) || participantId === rootScope.myId;
    const currentUserCanAct = !community.pFlags.left;
    const currentUserIsCreator = currentUserCanAct &&
      !!community.pFlags.creator;
    const currentRights = currentUserCanAct ?
      community.admin_rights :
      undefined;
    const canGrant = (permission: CommunityPermission) => {
      return currentUserIsCreator || !!currentRights?.pFlags[permission];
    };
    const canEditParticipant = !isCreator &&
      !isSelf &&
      canGrant('add_admins') &&
      (
        !participant ||
        !existingAdmin ||
        currentUserIsCreator ||
        !!existingAdmin.pFlags.can_edit ||
        existingAdmin.promoted_by.toPeerId(false) === rootScope.myId
      );
    const canDismissParticipant = !!participant && canEditParticipant;

    const section = new SettingSection({
      name: 'EditAdminWhatCanDo',
      caption: true
    });
    appendPermissionsPeerDialog({
      section,
      userId,
      user,
      middleware: tab.middlewareHelper.get()
    });

    const fields: AdministratorRightsCheckboxFieldsField[] =
      COMMUNITY_ADMIN_RIGHT_OPTIONS.map((option) => ({
        flags: [option.flag as ChatRights],
        text: option.title,
        checked: originalRights ?
          !!originalRights.pFlags[option.flag] :
          option.flag === 'add_admins' ? false : canGrant(option.flag)
      }));
    const permissionOptions: ConstructorParameters<
      typeof ChatAdministratorRights
    >[0] = {
      chatId: communityId,
      listenerSetter: tab.listenerSetter,
      appendTo: section.content,
      participant: participant?._ === 'channelParticipantAdmin' ||
        participant?._ === 'channelParticipantCreator' ?
        participant :
        undefined,
      rights: originalRights,
      canEdit: canEditParticipant,
      fields,
      canGrant: (right) => canGrant(right as CommunityPermission),
      preserveUnhandledRights: true
    };
    permissionOptions.onSomethingChanged = () => {
      solidState.set({rights: permissions.takeOut()});
    };
    const permissions = new ChatAdministratorRights(permissionOptions);

    const initialRights = permissions.takeOut();
    if(originalRights || !canEditParticipant) {
      solidState.setInitial({rights: copy(initialRights)});
    } else {
      solidState.set({rights: initialRights});
    }

    attachAdminRightsCaption({
      section,
      permissions,
      canEdit: canEditParticipant,
      listenerSetter: tab.listenerSetter
    });

    saveCallback = async() => {
      if(!canEditParticipant) {
        return;
      }

      if(!existingAdmin) {
        await confirmationPopup({
          titleLangKey: 'Community.PromoteAdmin',
          descriptionLangKey: 'Community.PromoteAdminConfirm',
          descriptionLangArgs: [await wrapPeerTitle({peerId: participantId})],
          button: {
            langKey: 'Community.Promote'
          }
        });
      }

      const rights = permissions.takeOut();
      const updatedParticipant = await tab.managers.appChatsManager.editAdmin(
        communityId,
        participant || participantId,
        rights,
        existingAdmin?.rank || '',
        true
      );
      await onUpdated?.(updatedParticipant || (
        existingAdmin ? {
          ...existingAdmin,
          admin_rights: rights
        } : {
          _: 'channelParticipantAdmin',
          pFlags: {can_edit: true},
          user_id: userId,
          promoted_by: rootScope.myId.toUserId(),
          date: Math.floor(Date.now() / 1000),
          admin_rights: rights
        }
      ));
    };

    tab.scrollable.append(section.container);

    if(canDismissParticipant) {
      const dismissSection = new SettingSection({});
      const dismissButton = Button(
        'btn-primary btn-transparent danger',
        {icon: 'deleteuser', text: 'Channel.Admin.Dismiss'}
      );
      attachClickEvent(dismissButton, async() => {
        if(solidState.saving()) {
          return;
        }

        const toggle = toggleDisability([dismissButton], true);
        try {
          await confirmationPopup({
            titleLangKey: 'Community.RemoveAdmin',
            descriptionLangKey: 'Community.RemoveAdminConfirm',
            button: {
              langKey: 'Channel.Admin.Dismiss',
              isDanger: true
            }
          });
          const updatedParticipant = await tab.managers.appChatsManager.editAdmin(
            communityId,
            participant || participantId,
            {_: 'chatAdminRights', pFlags: {}},
            '',
            true
          );
          await onUpdated?.(updatedParticipant || {
            _: 'channelParticipant',
            user_id: userId,
            date: Math.floor(Date.now() / 1000)
          });
          solidState.dispose();
          tab.close();
        } catch(error) {
          toggle();
          throw error;
        }
      }, {listenerSetter: tab.listenerSetter});
      dismissSection.content.append(dismissButton);
      tab.scrollable.append(dismissSection.container);
    }
  })());

  return null;
};

export default CommunityUserPermissions;
