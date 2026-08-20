import {createEffect, createRoot} from 'solid-js';
import {render} from 'solid-js/web';
import createCommunityAvatarElement
from '@components/communities/communityAvatarElement';
import CommunityChildBadge from '@components/communities/communityChildBadge';
import apiManagerProxy from '@lib/apiManagerProxy';
import {i18n} from '@lib/langPack';
import type {
  AppDialogsManager,
  DialogElement
} from '@lib/appDialogsManager';
import formatNumber from '@helpers/number/formatNumber';
import getDialogMentionBadgeState from '@helpers/dialogMentionBadgeState';
import {
  useCommunity,
  useCommunityDialog
} from '@stores/communities';
import styles from '@components/communities/communityDialog.module.scss';

export function createCommunityDialogListElement(
  manager: Pick<AppDialogsManager, 'addDialogNew' | 'setLastMessageN'>,
  communityId: ChatId
): DialogElement {
  const peerId = communityId.toPeerId(true);
  const avatar = createCommunityAvatarElement(communityId, 54);
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
      const {
        isMention: unreadMention,
        hasMentionsBadge
      } = getDialogMentionBadgeState({
        unreadCount,
        unreadMessagesCount: value?.unreadMessagesCount || 0,
        unreadMentionsCount: value?.unreadMentionsCount || 0,
        hasUnreadBadge: unread
      });
      const unreadText = !unread ? undefined :
        unreadCount === 1 && unreadMarked ? '' :
        unreadMention ? '@' : formatNumber(unreadCount, 1);
      // the muted icon follows the Community's own notify settings, exactly like a
      // forum row follows the forum's; an unmuted Community whose unread chats are
      // all muted only grays the badge out, the way `no-unmuted-topic` does there
      const muted = !!value?.muted;
      dom.listEl.classList.toggle(
        'no-unmuted-topic',
        !muted && unread && !value?.unreadUnmutedCount
      );
      dialogElement.setBadgeState({
        muted,
        pinned: !!value?.pFlags.pinned,
        unread,
        unreadText,
        unreadMention,
        unreadAvatar: false,
        mentions: hasMentionsBadge,
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

// The badge sits on EVERY row of the main chat list, so its lifetime is tied to
// the dialog element rather than to DOM connectedness: the virtual list detaches
// and re-attaches rows on every scroll pass, and a custom element would tear the
// reactive root down and rebuild it each time — ~20us per row per pass, ~93% of
// the row's whole mount cost, paid by every user whether or not they are in a
// single community.
export function attachCommunityChildBadge(
  dialogElement: DialogElement,
  peerId: PeerId
) {
  const host = document.createElement('div');
  host.classList.add(styles.ChildBadgeHost);

  const dispose = render(() => <CommunityChildBadge peerId={peerId} />, host);
  dialogElement.middlewareHelper.onDestroy(dispose);

  dialogElement.dom.listEl.append(host);
}
