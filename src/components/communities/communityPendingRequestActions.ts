import {createSignal, onCleanup} from 'solid-js';
import type {CommunityPeerRequest} from '@layer';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {i18n, LangPackKey} from '@lib/langPack';
import {hideToast, toast} from '@components/toast';

type StagedAction = {
  peerId: PeerId,
  request: CommunityPeerRequest,
  reject: boolean,
  canceled: boolean,
  committed: boolean
};

function getRequestSuccessKey(reject: boolean): LangPackKey {
  return reject ?
    'Community.RequestDeclined' :
    'Community.RequestAdded';
}

function createUndoToast(action: StagedAction, undo: () => void) {
  const content = document.createElement('span');
  const undoLink = document.createElement('a');
  undoLink.href = '#';
  undoLink.append(i18n('Undo'));
  undoLink.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    undo();
  });
  content.append(i18n(getRequestSuccessKey(action.reject)), ' ', undoLink);
  return content;
}

export default function createCommunityPendingRequestActions(options: {
  apply: (
    request: CommunityPeerRequest,
    reject: boolean
  ) => Promise<void>,
  onError: (
    error: ApiError,
    request: CommunityPeerRequest
  ) => MaybePromise<void>
}) {
  const [stagedPeerIds, setStagedPeerIds] = createSignal<Set<PeerId>>(
    new Set()
  );
  const commits = new Set<Promise<void>>();
  let activeAction: StagedAction;
  let disposed = false;

  const setStaged = (peerId: PeerId, staged: boolean) => {
    if(disposed) {
      return;
    }

    setStagedPeerIds((current) => {
      const next = new Set(current);
      if(staged) {
        next.add(peerId);
      } else {
        next.delete(peerId);
      }
      return next;
    });
  };

  const commit = (action: StagedAction) => {
    if(action.canceled || action.committed) {
      return Promise.resolve();
    }

    action.committed = true;
    if(activeAction === action) {
      activeAction = undefined;
    }

    const promise = options.apply(action.request, action.reject)
    .catch((error: ApiError) => options.onError(error, action.request))
    .then<void>(() => {})
    .finally(() => {
      commits.delete(promise);
      setStaged(action.peerId, false);
    });
    commits.add(promise);
    return promise;
  };

  const undo = (action: StagedAction) => {
    if(action.committed) {
      return;
    }

    action.canceled = true;
    if(activeAction === action) {
      activeAction = undefined;
    }
    setStaged(action.peerId, false);
    hideToast();
  };

  const stage = (
    request: CommunityPeerRequest,
    reject: boolean
  ) => {
    const peerId = getPeerId(request.peer);
    if(stagedPeerIds().has(peerId)) {
      return;
    }

    if(activeAction) {
      void commit(activeAction);
    }

    const action: StagedAction = {
      peerId,
      request,
      reject,
      canceled: false,
      committed: false
    };
    activeAction = action;
    setStaged(peerId, true);
    toast(
      createUndoToast(action, () => undo(action)),
      () => void commit(action),
      3000
    );
  };

  const flush = async() => {
    if(activeAction) {
      void commit(activeAction);
    }
    await Promise.all([...commits]);
  };

  onCleanup(() => {
    void flush();
    disposed = true;
  });

  return {
    stage,
    flush,
    stagedPeerIds
  };
}
