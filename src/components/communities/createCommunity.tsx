import {createSignal, createUniqueId, onCleanup} from 'solid-js';
import {i18n} from '@lib/langPack';
import AvatarEdit, {AvatarEditPayload} from '@components/avatarEdit';
import Button from '@components/buttonTsx';
import {InputFieldTsx} from '@components/inputFieldTsx';
import Section from '@components/section';
import {toastNew} from '@components/toast';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {
  AppCommunityChatSettingsTab,
  AppCreateCommunityTab,
  AppEditChatTab,
  AppEditCommunityTab,
  CommunityChatVisibility
} from '@components/solidJsTabs/tabs';
import {
  CommunityAvatarEditor
} from '@components/communities/communityAvatar';
import type {CommunityAddMode} from '@appManagers/utils/communities/communityAddMode';
import {
  COMMUNITY_TITLE_MAX_LENGTH,
  hasCommunityCreateChanges,
  saveCreatedCommunityFields,
  saveCurrentCommunityAvatar,
  type SavedCommunityCreateState
} from '@components/communities/communityEditState';
import {
  CommunityRadioOption,
  communitySharedStyles
} from '@components/communities/communityShared';
import CommunityPeerDialogList
from '@components/communities/communityPeerDialogList';

export default function CreateCommunity() {
  const [tab] = useSuperTab<typeof AppCreateCommunityTab>();
  const {peerId} = tab.payload;
  const [title, setTitle] = createSignal('');
  const [mode, setMode] = createSignal<CommunityAddMode>('all');
  const [sourceVisibility, setSourceVisibility] =
    createSignal<CommunityChatVisibility>('visible');
  const [hasAvatarPreview, setHasAvatarPreview] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const modeRadioName = createUniqueId();
  let uploadAvatar: AvatarEditPayload;
  let createdCommunityId: ChatId;
  let savedState: SavedCommunityCreateState<CommunityChatVisibility>;

  const avatarEdit = new AvatarEdit((payload) => {
    uploadAvatar = payload;
    setHasAvatarPreview(true);
  });
  const openVisibility = () => {
    tab.slider.createTab(AppCommunityChatSettingsTab).open({
      peerId,
      initialVisibility: sourceVisibility(),
      onSave: setSourceVisibility
    });
  };

  const getCurrentState = () => {
    return {
      title: title(),
      visibility: sourceVisibility(),
      mode: mode()
    };
  };

  const create = async() => {
    const trimmedTitle = title().trim();
    if(!trimmedTitle || saving()) {
      return;
    }

    const middleware = tab.middlewareHelper.get();
    let didRequestPeerLink = false;
    setSaving(true);
    try {
      if(!createdCommunityId) {
        const creatingState = getCurrentState();
        const communityId = await tab.managers.appCommunitiesManager.createCommunity({
          title: trimmedTitle,
          peerId,
          hidden: creatingState.visibility === 'hidden'
        });
        if(!middleware()) {
          return;
        }

        createdCommunityId = communityId;
        savedState = {
          title: trimmedTitle,
          visibility: creatingState.visibility
        };
      }

      const currentState = getCurrentState();
      if(!currentState.title.trim()) {
        return;
      }

      await saveCreatedCommunityFields({
        current: currentState,
        saved: savedState,
        saveTitle: (nextTitle) => {
          if(!middleware()) {
            return Promise.resolve();
          }

          return tab.managers.appChatsManager.editTitle(
            createdCommunityId,
            nextTitle
          );
        },
        saveVisibility: async(nextVisibility) => {
          if(!middleware()) {
            return;
          }

          const result = await tab.managers.appCommunitiesManager.togglePeerLink({
            communityId: createdCommunityId,
            peerId,
            action: nextVisibility
          });
          didRequestPeerLink ||= result.status === 'requested';
        },
        saveMode: (nextMode) => {
          if(!middleware()) {
            return Promise.resolve();
          }

          return tab.managers.appCommunitiesManager.editDefaultBannedRightsMode(
            createdCommunityId,
            nextMode
          );
        }
      });

      if(!middleware()) {
        return;
      }

      if(hasAvatarPreview() && uploadAvatar) {
        await saveCurrentCommunityAvatar({
          getPayload: () => uploadAvatar,
          save: (upload) => {
            return tab.managers.appChatsManager.editPhoto(
              createdCommunityId,
              upload
            );
          },
          clear: () => {
            uploadAvatar = undefined;
            setHasAvatarPreview(false);
          }
        });
      }

      if(!middleware()) {
        return;
      }

      if(
        hasCommunityCreateChanges(getCurrentState(), savedState) ||
        hasAvatarPreview()
      ) {
        return;
      }

      toastNew({
        langPackKey: didRequestPeerLink ?
          'Community.RequestSent' :
          'Community.Created'
      });

      const editTab = tab.slider.createTab(AppEditCommunityTab);
      await editTab.open({communityId: createdCommunityId});
      if(middleware() && tab.slider.getTab(AppEditChatTab)) {
        tab.slider.sliceTabsUntilTab(AppEditChatTab, editTab);
      }
    } catch(error) {
      if(!middleware()) {
        return;
      }

      console.error('create community error', error);
      toastNew({langPackKey: 'Error.AnError'});
    } finally {
      if(middleware()) {
        setSaving(false);
      }
    }
  };

  onCleanup(() => {
    avatarEdit.clear();
    uploadAvatar = undefined;
  });

  return (
    <div>
      <div class={communitySharedStyles.hero}>
        <CommunityAvatarEditor
          avatarEdit={avatarEdit}
          peerId={peerId}
          title={title() || i18n('Community.Title').textContent}
          hasPreview={hasAvatarPreview()}
        />
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
          />
        </div>
      </Section>

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

      <Section name="Community.ChatsCount" nameArgs={[1]}>
        <CommunityPeerDialogList
          items={[peerId]}
          middleware={tab.middlewareHelper.get()}
          getPeerId={(itemPeerId) => itemPeerId}
          onClick={openVisibility}
        />
      </Section>

      <Button
        class={communitySharedStyles.primaryButton}
        primaryFilled
        text="Community.Create"
        disabled={!title().trim() || saving()}
        onClick={create}
      />
    </div>
  );
}
