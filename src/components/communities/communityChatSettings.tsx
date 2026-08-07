import {createSignal, createUniqueId} from 'solid-js';
import {i18n} from '@lib/langPack';
import Button from '@components/buttonTsx';
import confirmationPopup from '@components/confirmationPopup';
import Section from '@components/section';
import {toastNew} from '@components/toast';
import apiManagerProxy from '@lib/apiManagerProxy';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {
  AppCommunityChatSettingsTab,
  AppEditChatTab,
  AppEditCommunityTab,
  CommunityChatVisibility
} from '@components/solidJsTabs/tabs';
import {
  CommunityRadioOption,
  communitySharedStyles
} from '@components/communities/communityShared';
import CommunityPeerDialogList
from '@components/communities/communityPeerDialogList';
import useCommunityTabGuard from '@components/communities/useCommunityTabGuard';

export default function CommunityChatSettings() {
  const [tab] = useSuperTab<typeof AppCommunityChatSettingsTab>();
  const {
    communityId,
    peerId,
    mode = 'settings',
    onSave,
    returnToEditChat,
    returnToEditCommunity
  } = tab.payload;
  useCommunityTabGuard(tab, communityId);
  const [visibility, setVisibility] = createSignal<CommunityChatVisibility>(
    tab.payload.initialVisibility || 'visible'
  );
  const [saving, setSaving] = createSignal(false);
  const visibilityRadioName = createUniqueId();
  const peer = apiManagerProxy.getPeer(peerId);
  const peerKind = peer?._ === 'user' && peer.pFlags.bot ?
    'bot' :
    (peer?._ === 'channel' && peer.pFlags.broadcast ? 'channel' : 'group');
  const suggestionKey = peerKind === 'bot' ?
    'Community.AddBotConfirm' as const :
    (
      peerKind === 'channel' ?
        'Community.AddChannelConfirm' as const :
        'Community.AddGroupConfirm' as const
    );
  const addedKey = peerKind === 'bot' ?
    'Community.BotAdded' as const :
    (
      peerKind === 'channel' ?
        'Community.ChannelAdded' as const :
        'Community.GroupAdded' as const
    );

  const confirmSuggestion = async() => {
    if(
      !communityId ||
      await tab.managers.appCommunitiesManager
      .canManageLinkedPeers(communityId)
    ) {
      return true;
    }

    try {
      await confirmationPopup({
        titleLangKey: 'Community.AddTo',
        descriptionLangKey: suggestionKey,
        button: {
          langKey: 'Add'
        }
      });
      return true;
    } catch{
      return false;
    }
  };

  const showPeersLimit = async() => {
    const isBot = peerId.isUser();
    const limit = await tab.managers.appCommunitiesManager.getPeersLimit(isBot);
    toastNew({
      langPackKey: isBot ?
        'Community.BotPeersLimit' :
        'Community.PeersLimit',
      langPackArguments: [limit]
    });
  };

  const save = async() => {
    if(saving()) {
      return;
    }

    setSaving(true);
    try {
      if(onSave) {
        await onSave(visibility());
      } else if(communityId) {
        if(!await confirmSuggestion()) {
          return;
        }

        const result = await tab.managers.appCommunitiesManager.togglePeerLink({
          communityId,
          peerId,
          action: visibility()
        });
        toastNew({
          langPackKey: result.status === 'requested' ?
            'Community.RequestSent' :
            addedKey
        });
      }

      const returnTab = returnToEditChat ?
        tab.slider.getTab(AppEditChatTab) :
        (
          returnToEditCommunity ?
            tab.slider.getTab(AppEditCommunityTab) :
            undefined
        );
      if(returnTab && await tab.slider.closeTabsUntilTab(returnTab)) {
        return;
      }
      tab.close();
    } catch(error) {
      if((error as ApiError).type === 'COMMUNITY_PEERS_TOO_MUCH') {
        try {
          await showPeersLimit();
        } catch(limitError) {
          console.error('load community peers limit error', limitError);
          toastNew({langPackKey: 'Error.AnError'});
        }
        return;
      }

      console.error('save community chat visibility error', error);
      toastNew({langPackKey: 'Error.AnError'});
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Section>
        <CommunityPeerDialogList
          items={[peerId]}
          middleware={tab.middlewareHelper.get()}
          getPeerId={(itemPeerId) => itemPeerId}
        />
      </Section>

      <Section
        name="Community.ChatVisibility"
        caption="Community.VisibilityImmutable"
      >
        <div role="radiogroup" aria-label={i18n('Community.ChatVisibility').textContent}>
          <CommunityRadioOption
            name={visibilityRadioName}
            value="visible"
            selected={visibility()}
            title="Community.Visible"
            subtitle="Community.VisibleInfo"
            onSelect={setVisibility}
          />
          <CommunityRadioOption
            name={visibilityRadioName}
            value="hidden"
            selected={visibility()}
            title="Community.Hidden"
            subtitle="Community.HiddenInfo"
            onSelect={setVisibility}
          />
        </div>
      </Section>

      <Button
        class={communitySharedStyles.primaryButton}
        primaryFilled
        text={mode === 'add' ? 'Community.AddTo' : 'Community.SaveChanges'}
        disabled={saving()}
        onClick={save}
      />
    </div>
  );
}
