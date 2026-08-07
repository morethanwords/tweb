import {createEffect, createMemo, createResource, on} from 'solid-js';
import CommunityLinkSection
from '@components/communities/communityLinkSection';
import confirmationPopup from '@components/confirmationPopup';
import type {AppEditBotTab} from '@components/solidJsTabs/tabs';
import {AppAddGroupToCommunityTab} from '@components/solidJsTabs/tabs';
import {toastNew} from '@components/toast';
import type {Chat, User} from '@layer';
import appDialogsManager from '@lib/appDialogsManager';
import {useUser} from '@stores/peers';

export default function EditBotCommunitySection(props: {
  tab: InstanceType<typeof AppEditBotTab>,
  peerId: PeerId,
  initialUser: User.user,
  initialCommunities: Array<Chat.community | Chat.communityForbidden>
}) {
  const botId = props.peerId.toUserId();
  const storedUser = useUser(() => botId);
  const user = () => {
    const value = storedUser();
    return value?._ === 'user' ? value : props.initialUser;
  };
  const linkedCommunityId = () => {
    return user().linked_community_id?.toChatId();
  };
  const hasInitialCommunity = (communityId: ChatId) => {
    return props.initialCommunities.some((community) => {
      return community.id.toChatId() === communityId;
    });
  };
  const [communities] = createResource(
    () => {
      const communityId = linkedCommunityId();
      return communityId && !hasInitialCommunity(communityId) ?
        communityId :
        undefined;
    },
    () => {
      return props.tab.managers.appCommunitiesManager
      .getJoinedCommunities(true)
      .catch((): [] => []);
    },
    {initialValue: props.initialCommunities}
  );
  const currentCommunities = createMemo(() => {
    return communities() || props.initialCommunities;
  });

  createEffect(on(linkedCommunityId, (communityId) => {
    if(communityId) {
      void Promise.resolve(props.tab.managers.appProfileManager
      .getChatFull(communityId))
      .catch((): undefined => undefined);
    }
  }));

  const remove = async(communityId: ChatId) => {
    try {
      await confirmationPopup({
        titleLangKey: 'Community.RemoveBot',
        descriptionLangKey: 'Community.RemoveConfirm',
        descriptionLangArgs: [user().first_name],
        button: {
          langKey: 'Remove',
          isDanger: true
        }
      });
    } catch{
      return;
    }

    try {
      await props.tab.managers.appCommunitiesManager.togglePeerLink({
        communityId,
        peerId: props.peerId,
        action: 'deleted'
      });
      toastNew({langPackKey: 'Community.BotRemoved'});
    } catch(error) {
      console.error('remove bot from community error', error);
      toastNew({langPackKey: 'Error.AnError'});
    }
  };

  return (
    <CommunityLinkSection
      linkedCommunityId={linkedCommunityId()}
      communities={currentCommunities()}
      middleware={props.tab.middlewareHelper.get()}
      caption="Community.BotDescription"
      hideCaptionWhenLinked
      hideWhenLinkedCommunityMissing
      addIcon="adduser"
      addText="Community.AddBot"
      removeText="Community.RemoveBot"
      onAdd={() => {
        props.tab.slider.createTab(AppAddGroupToCommunityTab)
        .open({peerId: props.peerId});
      }}
      onOpenCommunity={(communityId) => {
        void appDialogsManager.toggleForumTabByPeerId(
          communityId.toPeerId(true),
          true,
          false
        );
      }}
      onRemove={remove}
    />
  );
}
