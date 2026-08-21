import {createMemo, createSignal, createUniqueId, onCleanup, Show} from 'solid-js';
import {Portal} from 'solid-js/web';
import {Chat, ChatFull, CommunityPeer} from '@layer';
import {i18n} from '@lib/langPack';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import AvatarEdit, {AvatarEditPayload} from '@components/avatarEdit';
import Button from '@components/buttonTsx';
import confirmationPopup from '@components/confirmationPopup';
import {InputFieldTsx} from '@components/inputFieldTsx';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {toastNew} from '@components/toast';
import removeChatFromCommunityWithConfirmation
from '@components/communities/removeChatFromCommunity';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {
  AppAddChatToCommunityTab,
  AppChatAdministratorsTab,
  AppEditCommunityTab,
  AppRemovedUsersTab
} from '@components/solidJsTabs/tabs';
import type {CommunityPermission} from '@appManagers/appCommunitiesManager';
import {
  type CommunityAddMode,
  getCommunityAddMode
} from '@appManagers/utils/communities/communityAddMode';
import hasRights from '@appManagers/utils/chats/hasRights';
import CommunityAvatar, {
  CommunityAvatarEditor
} from '@components/communities/communityAvatar';
import {
  COMMUNITY_TITLE_MAX_LENGTH,
  canSaveCommunityEdit,
  hasCommunityEditChanges,
  saveCurrentCommunityAvatar
} from '@components/communities/communityEditState';
import {
  CommunityManagementRow,
  CommunityPendingRequestsRow,
  CommunityRadioOption,
  communitySharedStyles
} from '@components/communities/communityShared';
import CommunityPeerDialogList
from '@components/communities/communityPeerDialogList';
import {
  useCommunity,
  useCommunityFull,
  useCommunityPendingRequestsCount
} from '@stores/communities';
import useCommunityTabGuard from '@components/communities/useCommunityTabGuard';
import {IconTsx} from '@components/iconTsx';
import openCommunityPendingRequests
from '@components/communities/openCommunityPendingRequests';
import openCommunityLinkedChat
from '@components/communities/openCommunityLinkedChat';

export default function EditCommunity() {
  const [tab] = useSuperTab<typeof AppEditCommunityTab>();
  const promiseCollector = usePromiseCollector();
  const {communityId} = tab.payload;
  useCommunityTabGuard(tab, communityId);
  const community = useCommunity(() => communityId);
  const full = useCommunityFull(() => communityId);

  if(!community() || !full()) {
    promiseCollector.collect(
      tab.managers.appCommunitiesManager.reloadCommunity(communityId, false)
    );
  }

  return (
    <Show when={community() && full()}>
      <EditCommunityForm
        initialCommunity={community()}
        initialFull={full()}
      />
    </Show>
  );
}

function EditCommunityForm(props: {
  initialCommunity: Chat.community | Chat.communityForbidden,
  initialFull: ChatFull.communityFull
}) {
  const [tab] = useSuperTab<typeof AppEditCommunityTab>();
  const {communityId} = tab.payload;
  const communityStore = useCommunity(() => communityId);
  const fullStore = useCommunityFull(() => communityId);
  const pendingRequestsCount = useCommunityPendingRequestsCount(() => communityId);
  const community = () => communityStore() || props.initialCommunity;
  const full = () => fullStore() || props.initialFull;
  const [savedTitle, setSavedTitle] = createSignal(props.initialCommunity.title);
  const initialRights = props.initialCommunity._ === 'community' ?
    props.initialCommunity.default_banned_rights :
    undefined;
  const [savedMode, setSavedMode] = createSignal(getCommunityAddMode(initialRights));
  const [title, setTitle] = createSignal(savedTitle());
  const [mode, setMode] = createSignal<CommunityAddMode>(savedMode());
  const [saving, setSaving] = createSignal(false);
  const [removingPeerId, setRemovingPeerId] = createSignal<PeerId>();
  const [deleting, setDeleting] = createSignal(false);
  const [hasAvatarPreview, setHasAvatarPreview] = createSignal(false);
  const joiningPeerIds = new Set<PeerId>();
  const modeRadioName = createUniqueId();
  let uploadAvatar: AvatarEditPayload;

  const hasRight = (permission: CommunityPermission) => {
    return hasRights(community(), permission);
  };
  const canEditInfo = () => hasRight('change_info');
  const canManageChats = () => hasRight('manage_linked_peers');
  const canDeleteCommunity = () => {
    const value = community();
    return value?._ === 'community' && !!value.pFlags.creator;
  };
  const editState = () => {
    return {
      title: title(),
      savedTitle: savedTitle(),
      mode: mode(),
      savedMode: savedMode(),
      hasAvatarPreview: hasAvatarPreview()
    };
  };
  const isDirty = createMemo(() => {
    return hasCommunityEditChanges({
      ...editState(),
      canEditInfo: canEditInfo(),
      canManageChats: canManageChats()
    });
  });
  const canSave = createMemo(() => {
    return canSaveCommunityEdit({
      ...editState(),
      canEditInfo: canEditInfo(),
      canManageChats: canManageChats(),
      saving: saving()
    });
  });

  const avatarEdit = new AvatarEdit((payload) => {
    if(!canEditInfo()) {
      return;
    }

    uploadAvatar = payload;
    setHasAvatarPreview(true);
  });
  const openAddChat = () => {
    tab.slider.createTab(AppAddChatToCommunityTab).open({communityId});
  };

  const openAdministrators = () => {
    tab.slider.createTab(AppChatAdministratorsTab).open({communityId});
  };

  const openPendingRequests = () => {
    void openCommunityPendingRequests({slider: tab.slider, communityId});
  };

  const openRemovedUsers = () => {
    tab.slider.createTab(AppRemovedUsersTab).open({communityId});
  };

  const openPeer = (linkedPeer: CommunityPeer) => {
    const peerId = getPeerId(linkedPeer.peer);
    void openCommunityLinkedChat({
      communityId,
      peerId,
      linked: linkedPeer,
      managers: tab.managers,
      joiningPeerIds
    });
  };

  const removePeer = async(peerId: PeerId) => {
    if(removingPeerId() !== undefined) {
      return;
    }

    setRemovingPeerId(peerId);
    try {
      await removeChatFromCommunityWithConfirmation({
        communityId,
        peerId,
        managers: tab.managers
      });
    } finally {
      setRemovingPeerId(undefined);
    }
  };

  const deleteCommunity = async() => {
    if(deleting()) {
      return;
    }

    try {
      await confirmationPopup({
        titleLangKey: 'Community.Delete',
        descriptionLangKey: 'Community.DeleteConfirm',
        button: {
          langKey: 'Delete',
          isDanger: true
        }
      });
    } catch{
      return;
    }

    setDeleting(true);
    try {
      await tab.managers.appChatsManager.delete(communityId);
      toastNew({langPackKey: 'Community.Deleted'});
      tab.close();
    } catch(error) {
      console.error('delete community error', error);
      toastNew({langPackKey: 'Error.AnError'});
    } finally {
      setDeleting(false);
    }
  };

  const save = async() => {
    const trimmedTitle = title().trim();
    const editInfo = canEditInfo();
    const manageChats = canManageChats();
    if(!canSave()) {
      return;
    }

    setSaving(true);
    try {
      if(editInfo && trimmedTitle !== savedTitle()) {
        await tab.managers.appChatsManager.editTitle(communityId, trimmedTitle);
        setSavedTitle(trimmedTitle);
      }

      if(manageChats && mode() !== savedMode()) {
        const nextMode = mode();
        await tab.managers.appCommunitiesManager.editDefaultBannedRightsMode(
          communityId,
          nextMode
        );
        setSavedMode(nextMode);
      }

      if(editInfo && hasAvatarPreview() && uploadAvatar) {
        await saveCurrentCommunityAvatar({
          getPayload: () => uploadAvatar,
          save: (upload) => {
            return tab.managers.appChatsManager.editPhoto(
              communityId,
              upload
            );
          },
          clear: () => {
            uploadAvatar = undefined;
            setHasAvatarPreview(false);
          }
        });
      }

      if(!isDirty()) {
        tab.close();
      }
    } catch(error) {
      console.error('edit community error', error);
      toastNew({langPackKey: 'Error.AnError'});
    } finally {
      setSaving(false);
    }
  };

  onCleanup(() => {
    avatarEdit.clear();
    uploadAvatar = undefined;
  });

  return (
    <div>
      <Portal mount={tab.content}>
        <Show when={isDirty()}>
          <Button.Corner
            class={`${communitySharedStyles.saveCorner} is-visible`}
            icon="check"
            aria-label={i18n('Save').textContent}
            disabled={!canSave()}
            tabIndex={0}
            onClick={save}
          />
        </Show>
      </Portal>

      <div class={communitySharedStyles.hero}>
        <Show
          when={canEditInfo()}
          fallback={
            <CommunityAvatar
              community={community()}
              title={title()}
              size={120}
            />
          }
        >
          <CommunityAvatarEditor
            avatarEdit={avatarEdit}
            community={community()}
            title={title()}
            hasPreview={hasAvatarPreview()}
          />
        </Show>
      </div>

      <Section>
        <div class={`input-wrapper ${communitySharedStyles.editorFields}`}>
          <InputFieldTsx
            label="Community.Name"
            name="community-name"
            maxLength={COMMUNITY_TITLE_MAX_LENGTH}
            required
            value={title()}
            onRawInput={setTitle}
            disabled={!canEditInfo()}
          />
        </div>
      </Section>

      <Show when={canManageChats()}>
        <Section name="Community.WhoCanAddChats">
          <div role="radiogroup" aria-label={i18n('Community.WhoCanAddChats').textContent}>
            <CommunityRadioOption
              name={modeRadioName}
              value="all"
              selected={mode()}
              title="Community.AllMembers"
              subtitle="Community.AllMembersInfo"
              onSelect={setMode}
            />
            <CommunityRadioOption
              name={modeRadioName}
              value="admins"
              selected={mode()}
              title="Community.OnlyAdmins"
              subtitle="Community.OnlyAdminsInfo"
              onSelect={setMode}
            />
          </div>
        </Section>
      </Show>

      <Section>
        <CommunityManagementRow
          icon="admin_filled"
          title="PeerInfo.Administrators"
          right={String(full().admins_count ?? 0)}
          rightSecondary
          onClick={openAdministrators}
        />
        <Show when={
          canManageChats() &&
          !!pendingRequestsCount()
        }>
          <CommunityPendingRequestsRow
            count={pendingRequestsCount()}
            onClick={openPendingRequests}
          />
        </Show>
        <CommunityManagementRow
          icon="deleteuser"
          title="ChannelBlockedUsers"
          right={String(full().kicked_count ?? 0)}
          rightSecondary
          onClick={openRemovedUsers}
        />
      </Section>

      <Section
        name="Community.ChatsCount"
        nameArgs={[full().linked_peers.length]}
      >
        <Show when={canManageChats()}>
          <Row
            clickable={openAddChat}
            role="button"
            tabIndex={0}
            on:keydown={(event) => {
              if(event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.currentTarget.click();
              }
            }}
          >
            <Row.Icon icon="add" />
            <Row.Title>{i18n('Community.AddChat')}</Row.Title>
          </Row>
        </Show>

        <CommunityPeerDialogList
          avatarSize="abitbigger"
          items={full().linked_peers}
          middleware={tab.middlewareHelper.get()}
          getPeerId={(linkedPeer) => getPeerId(linkedPeer.peer)}
          getTitleAccessory={(linkedPeer) => (
            linkedPeer.visible === false ?
              <IconTsx
                class={`inline-icon inline-icon-right ${communitySharedStyles.hiddenPeerIcon}`}
                icon="eye2_filled"
              /> :
              undefined
          )}
          getContextMenu={(linkedPeer) => canManageChats() ? {
            buttons: [{
              icon: 'crossround',
              text: 'Community.RemoveChat',
              onClick: () => {
                void removePeer(getPeerId(linkedPeer.peer));
              }
            }]
          } : undefined}
          onClick={(linkedPeer) => {
            openPeer(linkedPeer);
          }}
        />
      </Section>

      <Show when={canDeleteCommunity()}>
        <Section>
          <Button
            class={`${communitySharedStyles.footerAction} btn-primary btn-transparent danger`}
            disabled={deleting()}
            icon="delete"
            text="Community.Delete"
            onClick={deleteCommunity}
          />
        </Section>
      </Show>
    </div>
  );
}
