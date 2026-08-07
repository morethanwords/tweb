import {createEffect, createRoot} from 'solid-js';
import {render} from 'solid-js/web';
import CommunityAvatar from '@components/communities/communityAvatar';
import CommunityChildBadge from '@components/communities/communityChildBadge';
import defineSolidElement from '@lib/solidjs/defineSolidElement';
import apiManagerProxy from '@lib/apiManagerProxy';
import {i18n} from '@lib/langPack';
import type {
  AppDialogsManager,
  DialogElement
} from '@lib/appDialogsManager';
import formatNumber from '@helpers/number/formatNumber';
import {
  useCommunity,
  useCommunityDialog
} from '@stores/communities';
import styles from '@components/communities/communityDialog.module.scss';

function createCommunityAvatarElement(communityId: ChatId) {
  const mount = document.createElement('div');
  const dispose = render(() => {
    const community = useCommunity(() => communityId);
    return (
      <CommunityAvatar
        community={community()}
        title={community()?.title}
        size={54}
      />
    );
  }, mount);

  return {
    dispose,
    element: mount.firstElementChild as HTMLElement
  };
}

export function createCommunityDialogListElement(
  manager: Pick<AppDialogsManager, 'addDialogNew' | 'setLastMessageN'>,
  communityId: ChatId
): DialogElement {
  const peerId = communityId.toPeerId(true);
  const avatar = createCommunityAvatarElement(communityId);
  const dialogElement = manager.addDialogNew({
    peerId,
    avatarElement: avatar.element,
    controlled: true,
    dontSetActive: true,
    fromName: apiManagerProxy.getChat(communityId)?.title || '',
    isMainList: true,
    wrapOptions: {}
  });
  const {dom} = dialogElement;
  dom.listEl.dataset.communityDialog = 'true';
  dom.listEl.dataset.communityId = '' + communityId;
  dialogElement.middlewareHelper.onDestroy(avatar.dispose);

  const disposeState = createRoot((dispose) => {
    const community = useCommunity(() => communityId);
    const dialog = useCommunityDialog(() => communityId);
    createEffect(() => {
      void dialogElement.updateTitle(community()?.title || '');
    });
    createEffect(() => {
      const value = dialog();
      const latestDialog = value?.lastDialogs[0];
      const lastMessage = latestDialog?.top_message ?
        apiManagerProxy.getMessageByPeer(
          latestDialog.peerId,
          latestDialog.top_message
        ) :
        undefined;

      delete dom.listEl.dataset.mid;
      if(latestDialog) {
        void manager.setLastMessageN({
          dialog: latestDialog,
          dialogElement,
          lastMessage,
          setMessageId: false,
          subtitlePeerId: latestDialog.peerId
        });
      } else {
        dom.setLastMessagePromise?.reject();
        dom.lastMessageSpan.replaceChildren(i18n(
          'Chats',
          [value?.dialogs.length || 0]
        ));
        dom.lastTimeSpan.replaceChildren();
      }

      const unreadCount = value?.unreadCount || 0;
      const unreadMarked = !!value?.unreadMarked;
      const unread = unreadCount > 0 || unreadMarked;
      const unreadMention = !!value?.unreadMentionsCount &&
        unreadCount === 1;
      const unreadText = !unread ? undefined :
        unreadCount === 1 && unreadMarked ? '' :
        unreadMention ? '@' : formatNumber(unreadCount, 1);
      dialogElement.setBadgeState({
        muted: unread && !value?.unreadUnmutedCount,
        pinned: !!value?.pFlags.pinned,
        unread,
        unreadText,
        unreadMention,
        unreadAvatar: false,
        mentions: !!value?.unreadMentionsCount &&
          (
            value.unreadMentionsCount > 1 ||
            unreadCount > 1
          ),
        reactions: !!value?.unreadReactionsCount,
        pollVotes: !!value?.unreadPollVotesCount,
        transitionDuration: 0
      });
    });

    return dispose;
  });
  dialogElement.middlewareHelper.onDestroy(disposeState);

  return dialogElement;
}

type CommunityChildBadgeProps = {
  peerId: PeerId
};

const CommunityChildBadgeElement = defineSolidElement<
  CommunityChildBadgeProps,
  never
>({
  name: 'community-child-dialog-badge',
  component: (props) => <CommunityChildBadge peerId={props.peerId} />
});

export function attachCommunityChildBadge(
  container: HTMLElement,
  peerId: PeerId
) {
  const element = new CommunityChildBadgeElement;
  element.feedProps({peerId});
  element.classList.add(styles.ChildBadgeHost);
  container.append(element);
}
