import lastItem from '@helpers/array/lastItem';
import ListenerSetter from '@helpers/listenerSetter';
import {I18nTsx} from '@helpers/solid/i18n';
import {useIsCleaned} from '@hooks/useIsCleaned';
import {Dialog} from '@layer';
import {FOLDER_ID_ARCHIVE} from '@lib/appManagers/constants';
import getDialogIndex from '@lib/appManagers/utils/dialogs/getDialogIndex';
import getDialogIndexKey from '@lib/appManagers/utils/dialogs/getDialogIndexKey';
import {isDialog} from '@lib/appManagers/utils/dialogs/isDialog';
import defineSolidElement, {PassedProps} from '@lib/solidjs/defineSolidElement';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {AckedResult} from '@lib/superMessagePort';
import {Accessor, createComputed, createEffect, createMemo, createResource, createRoot, createSignal, For, onCleanup, Setter, Show} from 'solid-js';
import styles from './archiveDialog.module.scss';
import {IconTsx} from './iconTsx';
import ripple from './ripple';

if(import.meta.hot) import.meta.hot.accept();


const limit = 10;
const limitSymbols = 20;

type ArchiveDialogProps = {
  state: DisposableArchiveDialogState['state'];
};

export const archiveDialogTagName = 'archive-dialog';

const ArchiveDialog = defineSolidElement({
  name: archiveDialogTagName,
  component: (props: PassedProps<ArchiveDialogProps>) => {
    props.element.classList.add('row', 'no-wrap', 'row-with-padding', 'row-clickable', 'hover-effect', 'rp', 'chatlist-chat', 'chatlist-chat-bigger', 'row-big');

    const {PeerTitleTsx} = useHotReloadGuard();

    const sortedDialogs = () => props.state.sortedDialogs();

    ripple(props.element, () => true);

    return (
      <>
        <div class={`${styles.Media} row-media row-media-bigger dialog-avatar`}>
          <IconTsx class={styles.MediaIcon} icon='archive' />
        </div>
        <div class='row-row row-title-row'>
          <I18nTsx class={styles.Title} key='Archive' />
        </div>
        <div class='row-row row-subtitle-row'>
          <div class={styles.Subtitle}>
            <For each={sortedDialogs()}>
              {(dialog, index) => (
                <>
                  <PeerTitleTsx peerId={dialog.peerId} onlyFirstName limitSymbols={limitSymbols} />
                  {index() !== sortedDialogs().length - 1 && ', '}
                </>
              )}
            </For>
          </div>
        </div>
      </>
    );
  }
});

type CreateArchiveDialogStateArgs = {
  onHasDialogsChanged: (hasDialogs: boolean) => void;
};

export type DisposableArchiveDialogState = ReturnType<typeof createArchiveDialogState>;

export const createArchiveDialogState = ({onHasDialogsChanged}: CreateArchiveDialogStateArgs) => createRoot((dispose) => {
  const state = useArchivedDialogsState();

  const hasDialogs = createMemo(() => state.sortedDialogs().length > 0);

  createEffect(() => {
    if(!state.isReady()) return;
    onHasDialogsChanged(hasDialogs());
  });

  return {
    state,
    hasDialogs,
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

  const [fetchedDialogs, {mutate}] = createResource(canFetch, () => fetchDialogs()); // used for initial loading state
  const [dialogs, setDialogs] = createSignal<Dialog.dialog[]>([]);

  const isReady = createMemo(() => fetchedDialogs.state === 'ready');
  const fetchedDialogsLength = createMemo(() => isReady() ? fetchedDialogs().dialogs.length : 0);
  const isEnd = createMemo(() => isReady() && fetchedDialogs().isEnd);

  const sortedDialogs = createMemo(() => dialogs().sort((a, b) => getArchivedDialogIndex(b) - getArchivedDialogIndex(a)));

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

  // Refetch when too little dialogs without triggering loading
  createEffect(() => {
    const isCleaned = useIsCleaned();

    if(
      isReady() &&
      !isEnd() &&
      dialogs().length < fetchedDialogsLength() &&
      dialogs().length < limit
    ) {
      (async() => {
        const fetched = await fetchDialogs();
        if(isCleaned()) return;
        mutate(fetched);
      })();
    }
  });

  function ensureHydrated() {
    if(canFetch()) return;

    setCanFetch(true);

    return initialPromise;
  }

  return {
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

export default ArchiveDialog;
