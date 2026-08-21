import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onMount,
  Show
} from 'solid-js';
import {Portal} from 'solid-js/web';
import {unwrap} from 'solid-js/store';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import apiManagerProxy from '@lib/apiManagerProxy';
import {i18n, LangPackKey} from '@lib/langPack';
import {PreloaderTsx} from '@components/putPreloader';
import Button from '@components/buttonTsx';
import CommunityAvatar from '@components/communities/communityAvatar';
import {
  CommunityPendingRequestRow,
  showCommunityRequestError
} from '@components/communities/communityPendingRequest';
import createCommunityPendingRequestActions
from '@components/communities/communityPendingRequestActions';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {IconTsx} from '@components/iconTsx';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {
  CommunityPendingRequestsRow
} from '@components/communities/communityShared';
import CommunityPeerDialogList
from '@components/communities/communityPeerDialogList';
import {
  getCommunityPeerSubtitle
} from '@components/communities/communityPeerStatus';
import hasRights from '@appManagers/utils/chats/hasRights';
import InlinePortal from '@helpers/solid/inlinePortal';
import {
  CommunityLinkedChat,
  CommunityLinkedChatKind,
  getCommunityChatSections,
  getCommunityLinkedChatKind
} from '@components/forumTab/communityChatsModel';
import {
  useCommunity,
  useCommunityDialog,
  useCommunityFull,
  useCommunityPendingRequestsCount,
  useCommunityPeerLinkRequests
} from '@stores/communities';
import {usePeers} from '@stores/peers';
import type {CommunityForumTab} from '@components/forumTab/communityForumTab';
import styles from '@components/forumTab/communityChats.module.scss';

export type {
  CommunityLinkedChatKind
} from '@components/forumTab/communityChatsModel';

const SECTION_TITLES: Record<
  Exclude<CommunityLinkedChatKind, 'excluded'>,
  LangPackKey
> = {
  joined: 'Community.ChatsJoined',
  viewable: 'Community.ChatsVisible',
  requestable: 'Community.ChatsRequestable',
  hidden: 'Community.ChatsHidden'
};

const MAX_INLINE_PENDING_REQUESTS = 1;

function CommunityDialogSection(props: {
  tab: CommunityForumTab,
  kind: Extract<CommunityLinkedChatKind, 'joined' | 'viewable'>,
  items: CommunityLinkedChat[]
}) {
  const list = props.tab.xd.getList(props.kind);

  return (
    <Show when={props.items.length}>
      <Section name={SECTION_TITLES[props.kind]}>
        {list}
      </Section>
    </Show>
  );
}

function CommunityPeerSection(props: {
  tab: CommunityForumTab,
  kind: Extract<CommunityLinkedChatKind, 'requestable' | 'hidden'>,
  items: CommunityLinkedChat[],
  open: (item: CommunityLinkedChat) => void
}) {
  return (
    <Show when={props.items.length}>
      <Section name={SECTION_TITLES[props.kind]}>
        <CommunityPeerDialogList
          avatarSize="abitbigger"
          items={props.items}
          middleware={props.tab.middlewareHelper.get()}
          getPeerId={(item) => item.peerId}
          // these rows are chats of the Community too, so they get the same menu — it is
          // the item verifies that whittle it down to what a chat we're not in can do
          withDialogContextMenu
          getDataset={(item) => ({
            communityId: '' + props.tab.peerId.toChatId(),
            communityChatKind: item.kind
          })}
          getSubtitle={(item) => getCommunityPeerSubtitle(
            apiManagerProxy.getPeer(item.peerId)
          )}
          getTitleAccessory={(item) => (
            <Show when={item.linked.visible === false}>
              <IconTsx
                class={`inline-icon inline-icon-right ${styles.HiddenPeerIcon}`}
                icon="eye2_filled"
              />
            </Show>
          )}
          onClick={props.open}
          listRef={(list) => {
            list.dataset.communitySection = props.kind;
          }}
        />
      </Section>
    </Show>
  );
}

export default function CommunityChats(props: {
  tab: CommunityForumTab
}) {
  const communityId = props.tab.peerId.toChatId();
  const community = useCommunity(() => communityId);
  const full = useCommunityFull(() => communityId);
  const communityDialog = useCommunityDialog(() => communityId);
  const pendingRequests = useCommunityPeerLinkRequests(() => communityId);
  const pendingRequestsCount = useCommunityPendingRequestsCount(() => communityId);
  const peers = usePeers();
  const [isTogglingAsOne, setIsTogglingAsOne] = createSignal(false);
  const [loadFailed, setLoadFailed] = createSignal(false);
  const [loadingFull, setLoadingFull] = createSignal(false);
  const loadFull = async() => {
    if(loadingFull()) {
      return;
    }

    setLoadingFull(true);
    try {
      await props.tab.managers.appProfileManager.getChatFull(communityId);
      setLoadFailed(false);
    } catch(error) {
      console.error('load community error', error);
      setLoadFailed(true);
    } finally {
      setLoadingFull(false);
    }
  };
  onMount(() => {
    void loadFull();
  });
  const pendingActions = createCommunityPendingRequestActions({
    apply: (request, reject) => {
      return props.tab.managers.appCommunitiesManager
      .togglePeerLinkRequestApproval({
        communityId,
        peerId: getPeerId(request.peer),
        reject
      });
    },
    onError: (error, request) => {
      return showCommunityRequestError({
        error,
        managers: props.tab.managers,
        peerId: getPeerId(request.peer)
      });
    }
  });
  // Deliberately NOT isCollapsedCommunity(): this only mirrors the flag for the toggle
  // below, while that predicate answers whether the Community folds its chats into OUR
  // list and so also demands membership. Swapping it in would draw the toggle off for a
  // Community we left while its flag is on, and flipping it would push a bogus change.
  const isCollapsed = () => {
    const value = community();
    return value?._ === 'community' &&
      !!value.pFlags.collapsed_in_dialogs;
  };

  const dialogByPeerId = createMemo(() => {
    return new Map(
      (communityDialog()?.dialogs || []).map((dialog) => [
        dialog.peerId,
        dialog
      ])
    );
  });
  const mutedPeerIds = createMemo(() => {
    return new Set(communityDialog()?.mutedPeerIds || []);
  });
  const linkedChats = createMemo(() => {
    return (full()?.linked_peers || []).map((linked, order) => {
      const peerId = getPeerId(linked.peer);
      const peer = peers[peerId] || apiManagerProxy.getPeer(peerId);
      const storedDialog = dialogByPeerId().get(peerId);
      const topMessage = storedDialog?.top_message;
      const draft = storedDialog?.draft;
      const dialog = storedDialog ? unwrap(storedDialog) : undefined;
      const message = topMessage ?
        apiManagerProxy.getMessageByPeer(peerId, topMessage) :
        undefined;
      const draftDate = draft?._ === 'draftMessage' ?
        draft.date :
        0;
      return {
        linked,
        peerId,
        dialog,
        lastMessage: message,
        muted: mutedPeerIds().has(peerId),
        kind: getCommunityLinkedChatKind(peer, linked, dialog),
        order,
        activityDate: Math.max(message?.date || 0, draftDate)
      } satisfies CommunityLinkedChat;
    });
  });
  const sections = createMemo(() => {
    return getCommunityChatSections(linkedChats());
  });
  const chatsCount = createMemo(() => full()?.linked_peers?.length);
  createEffect(() => {
    const value = sections();
    props.tab.xd.setItems([
      ...value.joined,
      ...value.viewable
    ]);
  });
  const canManageRequests = createMemo(() => {
    return hasRights(community(), 'manage_linked_peers');
  });
  const canAddChats = createMemo(() => {
    const value = community();
    return value?._ === 'community' &&
      !value.pFlags.left &&
      (
        hasRights(value, 'manage_linked_peers') ||
        !value.default_banned_rights?.pFlags.manage_linked_peers
      );
  });
  const pendingCount = createMemo(() => {
    if(!canManageRequests()) {
      return 0;
    }

    return pendingRequestsCount();
  });
  const inlinePendingRequests = createMemo(() => {
    if(pendingCount() > MAX_INLINE_PENDING_REQUESTS) {
      return [];
    }

    return (pendingRequests()?.requests || []).filter((request) => {
      return !pendingActions.stagedPeerIds().has(getPeerId(request.peer));
    });
  });
  let requestedPendingCount = -1;
  createEffect(() => {
    const count = pendingCount();
    const state = pendingRequests();
    if(state && !state.loaded) {
      requestedPendingCount = -1;
    }
    if(
      !count ||
      count > MAX_INLINE_PENDING_REQUESTS ||
      requestedPendingCount === count ||
      (state?.loaded && state.totalCount === count)
    ) {
      return;
    }

    requestedPendingCount = count;
    void props.tab.loadPendingRequests().catch(() => {
      requestedPendingCount = -1;
    });
  });
  const open = (item: CommunityLinkedChat) => {
    void props.tab.openLinkedChat({
      peerId: item.peerId,
      kind: item.kind,
      visible: item.linked.visible
    });
  };
  const toggleAsOne = async(collapsed: boolean) => {
    if(isTogglingAsOne()) {
      return;
    }

    setIsTogglingAsOne(true);
    try {
      await props.tab.toggleAsOne(collapsed);
    } finally {
      setIsTogglingAsOne(false);
    }
  };

  return (
    <>
      <Portal mount={props.tab.headerAvatar}>
        <CommunityAvatar
          community={community()}
          title={community()?.title}
          size={32}
        />
      </Portal>
      {/* not a Portal: its container div would nest inside the header rows and
          break their text-overflow */}
      <InlinePortal mount={props.tab.title}>
        {community()?.title || i18n('Community.Chats')}
      </InlinePortal>
      <InlinePortal mount={props.tab.subtitle}>
        {chatsCount() === undefined ?
          i18n('Community.Title') :
          i18n('Community.ChatsCount', [chatsCount()])}
      </InlinePortal>
      <Show
        when={
          full() ||
          community()?._ === 'communityForbidden'
        }
        fallback={
          <Show
            when={loadFailed()}
            fallback={
              <PreloaderTsx />
            }
          >
            <Section>
              <div class={styles.LoadError} role="alert">
                {i18n('Error.AnError')}
                <Button
                  class={styles.LoadErrorButton}
                  primaryTransparent
                  disabled={loadingFull()}
                  text="Community.Retry"
                  onClick={loadFull}
                />
              </div>
            </Section>
          </Show>
        }
      >
        <Section caption="Community.ShowAsOneInfo">
          <Row>
            <Row.CheckboxFieldToggle>
              <CheckboxFieldTsx
                toggle
                checked={isCollapsed()}
                disabled={
                  isTogglingAsOne() ||
                  community()?._ !== 'community'
                }
                onChange={(collapsed) => void toggleAsOne(collapsed)}
              />
            </Row.CheckboxFieldToggle>
            <Row.Title>{i18n('Community.ShowAsOne')}</Row.Title>
          </Row>
        </Section>
        <Show when={inlinePendingRequests().length}>
          <Section name="Community.PendingRequests">
            <For each={inlinePendingRequests()}>
              {(request) => (
                <CommunityPendingRequestRow
                  request={request}
                  onApply={pendingActions.stage}
                />
              )}
            </For>
          </Section>
        </Show>
        <Show when={pendingCount() > MAX_INLINE_PENDING_REQUESTS}>
          <Section>
            <CommunityPendingRequestsRow
              count={pendingCount()}
              onClick={props.tab.openPendingRequests}
            />
          </Section>
        </Show>
        <CommunityDialogSection
          tab={props.tab}
          kind="joined"
          items={sections().joined}
        />
        <CommunityDialogSection
          tab={props.tab}
          kind="viewable"
          items={sections().viewable}
        />
        <CommunityPeerSection
          tab={props.tab}
          kind="requestable"
          items={sections().requestable}
          open={open}
        />
        <CommunityPeerSection
          tab={props.tab}
          kind="hidden"
          items={sections().hidden}
          open={open}
        />
        <Show when={canAddChats()}>
          <Button
            class={styles.AddChatButton}
            primaryFilled
            icon="add"
            text="Community.AddChatButton"
            onClick={props.tab.openAddChat}
          />
        </Show>
      </Show>
    </>
  );
}
