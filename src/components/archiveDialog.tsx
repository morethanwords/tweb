import lastItem from '@helpers/array/lastItem';
import ListenerSetter from '@helpers/listenerSetter';
import formatNumber from '@helpers/number/formatNumber';
import {I18nTsx} from '@helpers/solid/i18n';
import {Dialog} from '@layer';
import {StoriesSegments} from '@lib/appManagers/appStoriesManager';
import {FOLDER_ID_ARCHIVE} from '@lib/appManagers/constants';
import getDialogIndex from '@lib/appManagers/utils/dialogs/getDialogIndex';
import getDialogIndexKey from '@lib/appManagers/utils/dialogs/getDialogIndexKey';
import {isDialog} from '@lib/appManagers/utils/dialogs/isDialog';
import defineSolidElement, {PassedProps} from '@lib/solidjs/defineSolidElement';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {AckedResult} from '@lib/superMessagePort';
import {useAppSettings} from '@stores/appSettings';
import {Accessor, createComputed, createEffect, createMemo, createResource, createRoot, createSignal, For, onCleanup, Ref, Setter, Show} from 'solid-js';
import {createStore, unwrap} from 'solid-js/store';
import styles from './archiveDialog.module.scss';
import Badge from './badge';
import {IconTsx} from './iconTsx';
import ripple from './ripple';
import {createStoriesStore, StoriesContextValue} from './stories/store';
import {createStoriesViewerWithProvider} from './stories/viewer';

// if(import.meta.hot) import.meta.hot.accept(); // screw it


const limit = 10;
const limitSymbols = 20;

type ArchiveDialogProps = {
  state: DisposableArchiveDialogState['state'];
};

type Controls = {
  openStory: () => void;
};

export const archiveDialogTagName = 'archive-dialog';

const ArchiveDialog = defineSolidElement({
  name: archiveDialogTagName,
  component: (props: PassedProps<ArchiveDialogProps>, _, controls: Controls) => {
    props.element.classList.add('row', 'no-wrap', 'row-with-padding', 'row-clickable', 'hover-effect', 'rp', 'chatlist-chat', 'chatlist-chat-bigger', 'row-big');

    const [openStoriesTarget, setOpenStoriesTarget] = createSignal<HTMLElement>();

    const sortedDialogs = createMemo(() => props.state.sortedDialogs().slice(0, limit)); // Note: more dialogs can appear if they've been updated
    const totalUnreadCount = () => props.state.totalUnreadCount();
    // const totalUnreadCount = () => 403430;

    // Note: we cannot use createStore on dialogs, because it requires reacting to the whole object change and then sending it into
    // the shared worker thread to compute whether it is unread or not
    const [cachedDialogUnread, setCachedDialogUnread] = createStore<Record<PeerId, boolean>>({});

    ripple(props.element, () => true);

    controls.openStory = () => {
      props.state.openArchiveStories(openStoriesTarget());
    };

    return (
      <>
        <ArchiveAvatar
          storiesSegments={props.state.segments()}
          ref={setOpenStoriesTarget}
        />
        <div class="row-row row-title-row">
          <I18nTsx class={styles.Title} key="ArchivedChats" />
        </div>
        <div class="row-row row-subtitle-row">
          <div class={styles.Subtitle}>
            <For each={sortedDialogs()}>
              {(dialog, index) => (
                <>
                  <PeerTitleItem
                    dialog={dialog}
                    cachedIsUnread={cachedDialogUnread[dialog.peerId]}
                    onIsUnreadChange={isUnread => setCachedDialogUnread(dialog.peerId, isUnread)}
                  />
                  {index() !== sortedDialogs().length - 1 && ', '}
                </>
              )}
            </For>
          </div>
          <Show when={totalUnreadCount() > 0}>
            <Badge class={styles.UnreadBadge} tag="span" size={22} color="gray">
              {formatNumber(totalUnreadCount(), 1)}
            </Badge>
          </Show>
        </div>
      </>
    );
  }
});

type CreateArchiveDialogStateArgs = {
  onHasArchiveDialogChanged: (hasDialogs: boolean) => void;
};

export type DisposableArchiveDialogState = ReturnType<typeof createArchiveDialogState>;

export const createArchiveDialogState = ({onHasArchiveDialogChanged}: CreateArchiveDialogStateArgs) => createRoot((dispose) => {
  const state = useArchivedDialogsState();

  const [appSettings] = useAppSettings();

  const hasDialogs = createMemo(() => state.sortedDialogs().length > 0);
  const hasArchiveDialog = createMemo(() => appSettings.showArchiveInChatList && hasDialogs());

  createEffect(() => {
    if(!state.isReady()) return;
    onHasArchiveDialogChanged(hasArchiveDialog());
  });

  return {
    state,
    hasArchiveDialog,
    dispose
  };
});

function useArchivedDialogsState() {
  const {rootScope} = useHotReloadGuard();

  let initialPromise: Promise<AckedResult<unknown>>;

  const fetchDialogs = async() => {
    const typedPromise = rootScope.managers.acknowledged.dialogsStorage.getDialogs({
      filterId: FOLDER_ID_ARCHIVE,
      limit
    });

    initialPromise = typedPromise;

    const ackedResult = await typedPromise;
    return ackedResult.result;
  };

  const [canFetch, setCanFetch] = createSignal(false);

  const [fetchedDialogs, {refetch}] = createResource(canFetch, () => fetchDialogs()); // used for initial loading state
  const [dialogs, setDialogs] = createSignal<Dialog.dialog[]>([]);

  const isReady = createMemo(() => fetchedDialogs.state === 'ready');
  const fetchedDialogsLength = createMemo(() => isReady() ? fetchedDialogs().dialogs.length : 0);
  const isEnd = createMemo(() => isReady() && fetchedDialogs().isEnd);

  const sortedDialogs = createMemo(() => [...dialogs()].sort((a, b) => getArchivedDialogIndex(b) - getArchivedDialogIndex(a)));

  createComputed(() => {
    if(fetchedDialogs.state === 'ready') {
      setDialogs(fetchedDialogs().dialogs.filter(d => isDialog(d)));
    }
  });

  useDialogEvents({
    sortedDialogs,
    setDialogs,
    isEnd
  });

  createEffect(() => {
    if(
      isReady() &&
      !isEnd() &&
      dialogs().length < fetchedDialogsLength() && // when some dialogs have been removed
      dialogs().length < limit
    ) {
      refetch();
    }
  });

  function ensureHydrated() {
    if(canFetch()) return;

    setCanFetch(true);

    return initialPromise;
  }

  const storiesContext = createStoriesStore({archive: true});

  return {
    totalUnreadCount: useTotalUnreadCount(),
    segments: useStoriesSegments(storiesContext),
    openArchiveStories: useOpenArchiveStories(storiesContext),
    ensureHydrated,
    isReady,
    sortedDialogs
  };
}

const isArchivedDialog = (dialog: Dialog.dialog) => dialog?.folder_id === FOLDER_ID_ARCHIVE;
const getArchivedDialogIndex = (dialog: Dialog.dialog) => getDialogIndex(dialog, getDialogIndexKey(FOLDER_ID_ARCHIVE));

type UseDialogEventsArgs = {
  sortedDialogs: Accessor<Dialog.dialog[]>;
  setDialogs: Setter<Dialog.dialog[]>;
  isEnd: Accessor<boolean>;
};

function useDialogEvents({sortedDialogs, setDialogs, isEnd}: UseDialogEventsArgs) {
  const {rootScope} = useHotReloadGuard();

  const listenerSetter = new ListenerSetter;

  const canKeepDialog = (dialog: Dialog.dialog) => {
    if(!isArchivedDialog(dialog)) return false;

    const last = lastItem(sortedDialogs());
    const isEmptyList = !last;

    const bottomIndex = getArchivedDialogIndex(last);
    const dialogIndex = getArchivedDialogIndex(dialog);

    return isEmptyList || dialogIndex >= bottomIndex || isEnd();
  };

  const addDialog = (dialog: Dialog.dialog) => setDialogs(prev => [
    ...prev.filter(d => d.peerId !== dialog.peerId),
    dialog
  ]);

  const removeDialog = (dialog: Dialog.dialog) => setDialogs(prev => prev.filter(d => d.peerId !== dialog.peerId));

  const updateDialog = (dialog: Dialog.dialog) => {
    if(canKeepDialog(dialog)) {
      addDialog(dialog);
    } else {
      removeDialog(dialog);
    }
  };

  listenerSetter.add(rootScope)('dialog_flush', ({dialog}) => {
    updateDialog(dialog);
  });

  listenerSetter.add(rootScope)('dialogs_multiupdate', (dialogs) => {
    for(const [, {dialog}] of dialogs) {
      if(!isDialog(dialog)) continue;
      updateDialog(dialog);
    }
  });

  listenerSetter.add(rootScope)('dialog_drop', (dialog) => {
    if(!isDialog(dialog)) return;
    removeDialog(dialog);
  });

  listenerSetter.add(rootScope)('dialog_unread', ({dialog}) => {
    if(!isDialog(dialog)) return;
    updateDialog(dialog);
  });

  listenerSetter.add(rootScope)('dialog_draft', ({dialog, drop}) => {
    if(!isDialog(dialog)) return;

    if(drop) {
      removeDialog(dialog);
    } else {
      updateDialog(dialog);
    }
  });

  onCleanup(() => {
    listenerSetter.removeAll();
  });
}

function useTotalUnreadCount() {
  const {rootScope} = useHotReloadGuard();

  const [totalUnreadCount, {mutate}] = createResource(
    () => rootScope.managers.dialogsStorage.getFolderUnreadCount(FOLDER_ID_ARCHIVE).then(result => result.unreadCount),
    {
      initialValue: 0
    }
  );

  const listenerSetter = new ListenerSetter;

  listenerSetter.add(rootScope)('folder_unread', (folder) => {
    if(folder.id === FOLDER_ID_ARCHIVE) {
      const count = folder.unreadPeerIds.size;
      mutate(count);
    }
  });

  onCleanup(() => {
    listenerSetter.removeAll();
  });

  return totalUnreadCount;
}

function useStoriesSegments(storiesContextValue: StoriesContextValue) {
  const {rootScope} = useHotReloadGuard();

  const [stories] = storiesContextValue;
  const storiesPeerIds = createMemo(() => stories.peers?.map(peer => peer.peerId));

  const [storiesSegments, setStoriesSegments] = createSignal<StoriesSegments>();

  const fetchStoriesSegmentsByPeerIds = (peerIds: PeerId[]) => rootScope.managers.appStoriesManager.getPeersStoriesSegments(peerIds);

  const [storiesSegmentsByPeerIds, {refetch}] = createResource(
    storiesPeerIds,
    fetchStoriesSegmentsByPeerIds
  );

  const listenerSetter = new ListenerSetter;

  listenerSetter.add(rootScope)('peer_stories', refetchStoriesSegments);
  listenerSetter.add(rootScope)('stories_read', refetchStoriesSegments);
  listenerSetter.add(rootScope)('story_deleted', refetchStoriesSegments);
  listenerSetter.add(rootScope)('story_new', refetchStoriesSegments);
  listenerSetter.add(rootScope)('story_update', refetchStoriesSegments);

  function refetchStoriesSegments({peerId}: { peerId: PeerId }) {
    if(!storiesPeerIds()?.includes(peerId)) return;
    refetch();
  }

  onCleanup(() => {
    listenerSetter.removeAll();
  });

  createComputed(() => {
    if(storiesSegmentsByPeerIds.state !== 'ready') return;

    if(!storiesSegmentsByPeerIds()?.length) {
      setStoriesSegments(undefined);
      return;
    }

    // Show only one segment per peer
    const newStoriesSegments = storiesSegmentsByPeerIds().map(({segments}) => {
      const segment =
        segments.find(segment => segment.type === 'close') ||
        segments.find(segment => segment.type === 'unread') ||
        segments[0];

      return {
        ...segment,
        length: 1
      };
    }).filter(Boolean);

    setStoriesSegments(newStoriesSegments);
  });

  return storiesSegments;
}

function useOpenArchiveStories(storiesContextValue: StoriesContextValue) {
  const [stories] = storiesContextValue;
  const [viewerTarget, setViewerTarget] = createSignal<HTMLElement>();

  const canOpenStories = createMemo(() => stories.ready && stories.peers.length > 0);

  const cloneCurrentPeers = () => structuredClone(unwrap(stories.peers));

  createEffect(() => {
    if(!viewerTarget()) return;

    const onExit = () => {
      setViewerTarget(undefined);
    };

    createStoriesViewerWithProvider({
      onExit,
      target: viewerTarget
    }, {
      peers: cloneCurrentPeers(),
      archive: true
    });
  });

  return (target: HTMLElement) => {
    if(!canOpenStories()) return;
    setViewerTarget(target);
  };
}

function PeerTitleItem(props: {
  dialog: Dialog.dialog;
  cachedIsUnread: boolean;
  onIsUnreadChange: (isUnread: boolean) => void;
}) {
  const {PeerTitleTsx, rootScope} = useHotReloadGuard();

  const [isUnread] = createResource(() => props.dialog, (dialog) => rootScope.managers.appMessagesManager.isDialogUnread(dialog));

  createEffect(() => {
    if(isUnread.state !== 'ready') return;

    if(isUnread() !== props.cachedIsUnread) {
      props.onIsUnreadChange(isUnread());
    }
  });

  return <PeerTitleTsx class={props.cachedIsUnread ? styles.unreadPeerTitle : undefined} peerId={props.dialog.peerId} limitSymbols={limitSymbols} />
};


function ArchiveAvatar(props: {
  storiesSegments: StoriesSegments;
  ref: Ref<HTMLDivElement>;
}) {
  const {StoriesSegments} = useHotReloadGuard();

  const hasStories = createMemo(() => props.storiesSegments?.length > 0);

  const {setStoriesSegments, storyDimensions, storiesCircle} = StoriesSegments({
    size: 54,
    colors: {}
  });

  createComputed(() => {
    setStoriesSegments(props.storiesSegments);
  });

  return (
    <div
      class={`${styles.Media} row-media row-media-bigger dialog-avatar`}
      classList={{
        'archive-dialog-with-stories': hasStories(),
        [styles.hasStories]: hasStories()
      }}
      style={{
        'padding': storyDimensions() ? (storyDimensions().size - storyDimensions().willBeSize) / 2 + 'px' : undefined
      }}
      ref={props.ref}
    >
      {storiesCircle()}
      <div class={styles.MediaContent}>
        <IconTsx class={styles.MediaIcon} icon="archive_filled" />
      </div>
    </div>
  );
};

export default ArchiveDialog;
