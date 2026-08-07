import {createEffect, createRoot} from 'solid-js';
import {Dialog} from '@appManagers/appMessagesManager';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE, REAL_FOLDERS} from '@appManagers/constants';
import getLinkedCommunityId from '@appManagers/utils/communities/getLinkedCommunityId';
import isCollapsedCommunity from '@appManagers/utils/communities/isCollapsedCommunity';
import getDialogIndex from '@appManagers/utils/dialogs/getDialogIndex';
import getDialogIndexKey from '@appManagers/utils/dialogs/getDialogIndexKey';
import {isDialog, isForumTopic} from '@appManagers/utils/dialogs/isDialog';
import ArchiveDialog, {createArchiveDialogState, DisposableArchiveDialogState} from '@components/archiveDialog';
import {AutonomousDialogListBase, BaseConstructorArgs, LoadDialogsInnerArgs} from '@components/autonomousDialogList/base';
import {BADGE_TRANSITION_TIME} from '@components/autonomousDialogList/constants';
import groupCallActiveIcon from '@components/groupCallActiveIcon';
import Scrollable from '@components/scrollable';
import SetTransition from '@components/singleTransition';
import SortedDialogList, {
  CustomPinnedDialog,
  CustomSortedDialog
} from '@components/sortedDialogList';
import {
  createCommunityDialogListElement
} from '@components/communities/communityDialog';
import IS_GROUP_CALL_SUPPORTED from '@environment/groupCallSupport';
import namedPromises from '@helpers/namedPromises';
import noop from '@helpers/noop';
import {Chat} from '@layer';
import apiManagerProxy from '@lib/apiManagerProxy';
import {AppDialogsManager, DialogDom} from '@lib/appDialogsManager';
import rootScope from '@lib/rootScope';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {runWithHotReloadGuard} from '@lib/solidjs/runWithHotReloadGuard';
import {useCommunityDialogs} from '@stores/communities';
import {usePeers} from '@stores/peers';


type ConstructorArgs = BaseConstructorArgs & {
  filterId: number;
};

type CommunityProjection = {
  communityId: ChatId,
  dialogs: Array<{
    peerId: PeerId,
    folderId: number,
    filterIndex?: number
  }>,
  pinned: boolean,
  pinnedOrderIndex: number,
  pinnedOrderLength: number,
  sortDate: number
};

// A hidden peer that only moves between folders shifts a real folder's count:
// it leaves the count of the folder it came from and joins the one it went to.
// Peers that appear or disappear from the projection are already accounted for
// by the total-count offset, so they contribute nothing here.
export function getCommunityProjectionFolderCountDelta(
  previousPeerFolderIds: ReadonlyMap<PeerId, number>,
  nextPeerFolderIds: ReadonlyMap<PeerId, number>,
  folderId: number
) {
  let delta = 0;
  for(const [peerId, previousFolderId] of previousPeerFolderIds) {
    const nextFolderId = nextPeerFolderIds.get(peerId);
    if(
      nextFolderId === undefined ||
      nextFolderId === previousFolderId
    ) {
      continue;
    }

    if(previousFolderId === folderId) {
      --delta;
    }
    if(nextFolderId === folderId) {
      ++delta;
    }
  }

  return delta;
}

export class AutonomousDialogList extends AutonomousDialogListBase<Dialog> {
  protected filterId: number;
  private archiveDialogState?: DisposableArchiveDialogState;
  private customPinnedDialog?: CustomPinnedDialog;
  private communityProjectionDispose?: () => void;
  private communityProjectionRows = new Map<ChatId, CustomSortedDialog>();
  private communityProjectionSnapshot: CommunityProjection[] = [];
  private communityProjectionPromise = Promise.resolve();
  private communityProjectionGeneration = 0;
  private projectedPeerIds = new Set<PeerId>();
  private projectedPeerFolderIds = new Map<PeerId, number>();
  private filterPinnedPeerIds = new Set<PeerId>();
  private communityProjectionDestroyed = false;

  constructor({filterId, ...args}: ConstructorArgs) {
    super(args);

    this.filterId = filterId;

    if(filterId === FOLDER_ID_ALL) {
      this.customPinnedDialog = new CustomPinnedDialog({
        render: () => {
          const element = new ArchiveDialog;
          element.HotReloadGuard = SolidJSHotReloadGuardProvider;

          element.feedProps({
            state: this.archiveDialogState.state
          });

          return element;
        }
      });

      this.archiveDialogState = runWithHotReloadGuard(() => createArchiveDialogState({
        onHasArchiveDialogChanged: (hasDialogs) => {
          this.onHasArchiveDialogChanged(hasDialogs);
        }
      }));
    }

    this.needPlaceholderAtFirstTime = true;

    this.listenerSetter.add(rootScope)('peer_typings', async({peerId, typings}) => {
      const [dialog, isForum] = await Promise.all([
        this.managers.appMessagesManager.getDialogOnly(peerId),
        this.managers.appPeersManager.isForum(peerId)
      ]);

      if(!dialog || isForum) return;

      if(typings.length) {
        this.setTyping(dialog);
      } else {
        this.unsetTyping(dialog);
      }
    });

    this.listenerSetter.add(rootScope)('user_update', async(userId) => {
      if(!this.isActive) {
        return;
      }

      const peerId = userId.toPeerId();
      const dom = this.getDialogDom(peerId);
      if(!dom) {
        return;
      }

      const status = await this.managers.appUsersManager.getUserStatus(userId);
      const online = status?._ === 'userStatusOnline';
      this.setOnlineStatus(dom.avatarEl.node, online);
    });

    this.listenerSetter.add(rootScope)('chat_update', async(chatId) => {
      const peerId = chatId.toPeerId(true);
      this.processDialogForCallStatus(peerId);
    });

    this.listenerSetter.add(rootScope)('dialog_flush', ({dialog}) => {
      if(!this.isActive || !dialog) {
        return;
      }

      this.updateDialog(dialog);
    });

    this.listenerSetter.add(rootScope)('dialogs_multiupdate', (dialogs) => {
      if(!this.isActive) {
        return;
      }

      for(const [peerId, {dialog, topics}] of dialogs) {
        if(!isDialog(dialog)) {
          continue;
        }

        this.updateDialog(dialog);
        this.appDialogsManager.processContact?.(peerId.toPeerId());
      }
    });

    this.listenerSetter.add(rootScope)('dialog_drop', (dialog) => {
      if(!this.isActive || !isDialog(dialog)) {
        return;
      }

      const key = this.getDialogKey(dialog);
      if(
        REAL_FOLDERS.has(this.filterId) &&
        this.projectedPeerIds.has(dialog.peerId) &&
        !this.sortedList.has(key)
      ) {
        this.sortedList.adjustTotalCount(-1);
      } else {
        this.deleteDialogByKey(key);
      }
      this.appDialogsManager.processContact?.(dialog.peerId);
    });

    this.listenerSetter.add(rootScope)('dialog_unread', ({dialog}) => {
      if(!this.isActive || !isDialog(dialog)) {
        return;
      }

      this.updateDialog(dialog);
    });

    this.listenerSetter.add(rootScope)('dialog_notify_settings', (dialog) => {
      if(!this.isActive || !isDialog(dialog)) {
        return;
      }

      this.updateDialog(dialog);
    });

    this.listenerSetter.add(rootScope)('dialog_draft', ({dialog, drop, peerId}) => {
      if(!this.isActive || isForumTopic(dialog)) {
        return;
      }

      if(drop) {
        this.deleteDialog(dialog);
      } else {
        this.updateDialog(dialog);
      }

      this.appDialogsManager.processContact?.(peerId);
    });

    this.listenerSetter.add(rootScope)('filter_update', async(filter) => {
      if(filter.id === this.filterId && !REAL_FOLDERS.has(filter.id)) {
        this.filterPinnedPeerIds = new Set(filter.pinnedPeerIds);
        await this.scheduleCommunityProjection();
      }
      if(this.isActive && filter.id === this.filterId && !REAL_FOLDERS.has(filter.id)) {
        const dialogs = await this.managers.dialogsStorage.getCachedDialogs(true);
        await this.validateListForFilter();
        for(let i = 0, length = dialogs.length; i < length; ++i) {
          const dialog = dialogs[i];
          this.updateDialog(dialog);
        }

        if(this.appDialogsManager.filterId === this.filterId) {
          this.appDialogsManager.fetchChatlistUpdates?.();
        }
      }
    });

    this.listenerSetter.add(rootScope)('auto_delete_period_update', ({peerId, period}) => {
      this.getDialogElement(peerId)?.dom?.avatarEl?.setAutoDeletePeriod(period);
    });
  }

  private get isActive() {
    return this.appDialogsManager.xd === this;
  }

  public getRectFromForPlaceholder() {
    return this.filterId === FOLDER_ID_ARCHIVE ? this.appDialogsManager.chatsContainer : this.appDialogsManager.folders.container;
  }

  protected getFilterId() {
    return this.filterId;
  }

  public setOnlineStatus(element: HTMLElement, online: boolean) {
    const className = 'is-online';
    const hasClassName = element.classList.contains(className);
    !hasClassName && online && element.classList.add(className);
    SetTransition({
      element: element,
      className: 'is-visible',
      forwards: online,
      duration: 250,
      onTransitionEnd: online ? undefined : () => {
        element.classList.remove(className);
      },
      useRafs: online && !hasClassName ? 2 : 0
    });
  }

  public generateScrollable(filter: Parameters<AppDialogsManager['addFilter']>[0]) {
    const filterId = filter.id;
    const pinnedPeerIds = (
      filter as typeof filter & {pinnedPeerIds?: PeerId[]}
    ).pinnedPeerIds;
    this.filterPinnedPeerIds = new Set(pinnedPeerIds || []);
    const scrollable = new Scrollable(null, 'CL', 500);
    scrollable.container.dataset.filterId = '' + filterId;

    const indexKey = getDialogIndexKey(filter.localId);
    const sortedDialogList = new SortedDialogList({
      appDialogsManager: this.appDialogsManager,
      managers: rootScope.managers,
      log: this.log,
      scrollable: scrollable,
      indexKey,
      requestItemForIdx: this.requestItemForIdx,
      onListShrinked: this.onListShrinked,
      itemSize: 72,
      onListLengthChange: () => {
        scrollable.onSizeChange();
        this.appDialogsManager.onListLengthChange?.();
      }
    });


    this.scrollable = scrollable;
    this.sortedList = sortedDialogList;
    this.setIndexKey(indexKey);
    this.bindScrollable();
    this.setupCommunityProjection();

    // list.classList.add('hide');
    // scrollable.container.style.backgroundColor = '#' + (Math.random() * (16 ** 6 - 1) | 0).toString(16);

    return {scrollable, list: sortedDialogList.list};
  }

  public testDialogForFilter(dialog: Dialog) {
    const collapsedCommunityId = this.getCollapsedCommunityId(dialog.peerId);
    if(
      collapsedCommunityId &&
      (
        REAL_FOLDERS.has(this.filterId) ||
        !this.filterPinnedPeerIds.has(dialog.peerId)
      )
    ) {
      return false;
    }

    if(!REAL_FOLDERS.has(this.filterId) ? getDialogIndex(dialog, this.indexKey) === undefined : this.filterId !== dialog.folder_id) {
      return false;
    }

    return true;
  }

  protected async loadDialogsInner({offsetIndex, canFinish}: LoadDialogsInnerArgs) {
    const isFirstLoad = !offsetIndex;

    const unblock = isFirstLoad ? this.sortedList.blockAnimation() : noop;
    try {
      const {result} = await namedPromises({
        result: super.loadDialogsInner({
          offsetIndex,
          removePlaceholder: false,
          canFinish
        }),
        _ignore: this.ensureArchiveDialogHydrated()
      });

      await this.scheduleCommunityProjection();
      this.placeholder?.detach(this.sortedList.itemsLength());

      return {
        ...result,
        totalCount: this.sortedList.itemsLength()
      };
    } finally {
      unblock();
    }
  }

  private async ensureArchiveDialogHydrated() {
    if(!this.archiveDialogState) return;

    const promise = this.archiveDialogState.state.ensureHydrated();
    if(!promise) {
      await this.onHasArchiveDialogChanged(this.archiveDialogState.hasArchiveDialog());
      return;
    }

    const ackedResult = await promise;
    if(!ackedResult.cached) return;

    return ackedResult.result;
  }

  private setupCommunityProjection() {
    if(this.communityProjectionDispose) {
      return;
    }

    this.communityProjectionDispose = createRoot((dispose) => {
      const peers = usePeers();
      const communityDialogs = useCommunityDialogs();

      createEffect(() => {
        const projection: CommunityProjection[] = [];
        for(const id of Object.keys(communityDialogs)) {
          const communityId = id.toChatId();
          // read unconditionally: this runs in an effect, and short-circuiting past the
          // peer would drop its subscription
          const community = peers[communityId.toPeerId(true)];
          const dialog = communityDialogs[communityId];
          if(!dialog || !isCollapsedCommunity(community)) {
            continue;
          }

          projection.push({
            communityId,
            dialogs: dialog.dialogs
            .filter((dialog) => {
              return dialog.migratedTo === undefined;
            })
            .map((dialog) => ({
              peerId: dialog.peerId,
              folderId: dialog.folder_id,
              filterIndex: getDialogIndex(dialog, this.indexKey)
            })),
            pinned: !!dialog.pFlags.pinned,
            pinnedOrderIndex: dialog.pinnedOrderIndex,
            pinnedOrderLength: dialog.pinnedOrderLength,
            sortDate: dialog.sortDate
          });
        }

        this.communityProjectionSnapshot = projection;
        void this.scheduleCommunityProjection().catch(noop);
      });

      return dispose;
    });
  }

  private getCollapsedCommunityId(peerId: PeerId) {
    const communityId = getLinkedCommunityId(apiManagerProxy.getPeer(peerId));
    if(!communityId) {
      return;
    }

    const communityDialog = apiManagerProxy.getCommunityDialog(communityId);
    return communityDialog &&
      isCollapsedCommunity(apiManagerProxy.getChat(communityId)) ?
      communityId :
      undefined;
  }

  private scheduleCommunityProjection() {
    if(
      this.communityProjectionDestroyed ||
      !this.sortedList
    ) {
      return Promise.resolve();
    }

    const generation = this.communityProjectionGeneration;
    const canFinish = () => {
      return !this.communityProjectionDestroyed &&
        generation === this.communityProjectionGeneration;
    };
    this.communityProjectionPromise = this.communityProjectionPromise
    .catch(noop)
    .then(async() => {
      if(!canFinish()) {
        return;
      }

      const unblock = this.sortedList.blockAnimation();
      try {
        await this.applyCommunityProjection(
          this.communityProjectionSnapshot,
          canFinish
        );
      } finally {
        unblock();
      }
    });

    return this.communityProjectionPromise;
  }

  private async applyCommunityProjection(
    projection: CommunityProjection[],
    canFinish: () => boolean
  ) {
    if(!canFinish()) {
      return;
    }

    const hasCommunityRows = this.filterId === FOLDER_ID_ALL;
    if(hasCommunityRows) {
      const projectedCommunityIds = new Set(
        projection.map(({communityId}) => communityId)
      );
      for(const [communityId, row] of this.communityProjectionRows) {
        if(projectedCommunityIds.has(communityId)) {
          continue;
        }

        this.sortedList.delete(row, false);
        row.destroy();
        this.communityProjectionRows.delete(communityId);
      }
    }

    const hiddenPeerIds = new Set<PeerId>();
    const peerFolderIds = new Map<PeerId, number>();
    for(const item of projection) {
      if(hasCommunityRows) {
        let row = this.communityProjectionRows.get(item.communityId);
        if(!row) {
          row = this.createCommunityProjectionRow(item.communityId);
          this.communityProjectionRows.set(item.communityId, row);
        }

        if(this.sortedList.has(row)) {
          await this.sortedList.update(row, canFinish);
        } else {
          await this.sortedList.add(row, canFinish);
        }
        if(!canFinish()) {
          return;
        }
      }

      for(const {peerId, folderId, filterIndex} of item.dialogs) {
        peerFolderIds.set(peerId, folderId);
        const hiddenInFilter = REAL_FOLDERS.has(this.filterId) ?
          folderId === this.filterId :
          filterIndex !== undefined &&
            !this.filterPinnedPeerIds.has(peerId);
        if(!hiddenInFilter) {
          continue;
        }

        hiddenPeerIds.add(peerId);
        if(this.sortedList.has(peerId)) {
          this.sortedList.delete(peerId, false);
        }
      }
    }

    for(const peerId of this.projectedPeerIds) {
      if(hiddenPeerIds.has(peerId)) {
        continue;
      }

      const dialog = await this.managers.appMessagesManager
      .getDialogOnly(peerId);
      if(!canFinish()) {
        return;
      }
      if(
        dialog &&
        this.testDialogForFilter(dialog) &&
        this.canUpdateDialog(dialog) &&
        !this.sortedList.has(peerId)
      ) {
        await this.sortedList.add(peerId, canFinish);
        if(!canFinish()) {
          return;
        }
      }
    }

    const folderCountDelta = REAL_FOLDERS.has(this.filterId) ?
      getCommunityProjectionFolderCountDelta(
        this.projectedPeerFolderIds,
        peerFolderIds,
        this.filterId
      ) :
      0;
    this.projectedPeerIds = hiddenPeerIds;
    this.projectedPeerFolderIds = peerFolderIds;
    // Community rows join the list, their hidden ordinary peers leave it.
    const communityRowsCount = hasCommunityRows ? projection.length : 0;
    this.sortedList.setTotalCountOffset(
      communityRowsCount - hiddenPeerIds.size,
      folderCountDelta
    );
  }

  private createCommunityProjectionRow(communityId: ChatId) {
    let dialogElement: ReturnType<typeof createCommunityDialogListElement>;
    return new CustomSortedDialog({
      render: () => {
        dialogElement ||= createCommunityDialogListElement(
          this.appDialogsManager,
          communityId
        );
        const element = dialogElement.dom.listEl;
        if(
          this.appDialogsManager.forumTab?.peerId ===
          communityId.toPeerId(true)
        ) {
          element.classList.add('is-forum-open');
        }
        return element;
      },
      destroy: () => dialogElement?.destroy(),
      getIndex: () => {
        const dialog = apiManagerProxy.getCommunityDialog(communityId);
        if(!dialog) {
          return 0;
        }

        if(!dialog.pFlags.pinned) {
          return dialog.sortDate * 0x10000;
        }

        const reversePinnedIndex = dialog.pinnedOrderIndex === -1 ?
          dialog.pinnedOrderLength :
          dialog.pinnedOrderLength - 1 - dialog.pinnedOrderIndex;
        const pinnedDate = 0x7fff0000 + (reversePinnedIndex & 0xFFFF);
        return pinnedDate * 0x10000;
      }
    });
  }

  public getListElement(peerId: PeerId) {
    const dialogElement = this.getDialogElement(peerId);
    if(dialogElement) {
      return dialogElement.dom.listEl;
    }

    return this.communityProjectionRows
    .get(peerId.toChatId())
    ?.getElement();
  }

  /**
   * Удалит неподходящие чаты из списка, но не добавит их(!)
   */
  public async validateListForFilter() {
    this.sortedList.getAllDialogElementsMap().forEach(async(_, key) => {
      const dialog = await rootScope.managers.appMessagesManager.getDialogOnly(key);
      if(!this.testDialogForFilter(dialog)) {
        if(
          REAL_FOLDERS.has(this.filterId) &&
          this.getCollapsedCommunityId(dialog.peerId)
        ) {
          this.sortedList.delete(dialog.peerId, false);
        } else {
          this.deleteDialog(dialog);
        }
      }
    });
  }

  public updateDialog(dialog: Dialog) {
    const collapsedCommunityId = this.getCollapsedCommunityId(dialog.peerId);
    if(
      collapsedCommunityId &&
      (
        REAL_FOLDERS.has(this.filterId) ||
        !this.filterPinnedPeerIds.has(dialog.peerId)
      )
    ) {
      if(
        REAL_FOLDERS.has(this.filterId) &&
        this.sortedList.has(dialog.peerId)
      ) {
        this.sortedList.delete(dialog.peerId, false);
      } else if(this.getDialogElement(dialog.peerId)) {
        this.deleteDialog(dialog);
      }
      return;
    }

    if(!this.testDialogForFilter(dialog)) {
      if(this.getDialogElement(dialog.peerId)) {
        this.deleteDialog(dialog);
      }

      return;
    }

    return super.updateDialog(dialog);
  }

  public setCallStatus(dom: DialogDom, visible: boolean) {
    let {callIcon, listEl} = dom;
    if(!callIcon && visible) {
      const {canvas, startAnimation} = dom.callIcon = callIcon = groupCallActiveIcon(listEl.classList.contains('active'));
      canvas.classList.add('dialog-group-call-icon');
      listEl.append(canvas);

      listEl.classList.add('has-group-call-icon');
      startAnimation();
    }

    if(!callIcon) {
      return;
    }

    SetTransition({
      element: dom.callIcon.canvas,
      className: 'is-visible',
      forwards: visible,
      duration: BADGE_TRANSITION_TIME,
      onTransitionEnd: visible ? undefined : () => {
        dom.callIcon.canvas.remove();
        dom.callIcon = undefined;
        listEl.classList.remove('has-group-call-icon');
      },
      useRafs: visible ? 2 : 0
    });
  }

  public processDialogForCallStatus(peerId: PeerId, dom?: DialogDom) {
    if(!IS_GROUP_CALL_SUPPORTED) {
      return;
    }

    if(!dom) dom = this.getDialogDom(peerId);
    if(!dom) return;

    const chat = apiManagerProxy.getChat(peerId.toChatId()) as Chat.chat | Chat.channel;
    this.setCallStatus(dom, !!(chat.pFlags.call_active && chat.pFlags.call_not_empty));
  }

  protected onScrolledBottom() {
    super.onScrolledBottom();

    if(this.hasReachedTheEnd) {
      this.appDialogsManager.loadContacts?.();
    }
  }

  public toggleAvatarUnreadBadges(value: boolean, useRafs: number) {
    if(!value) {
      this.sortedList.getAllDialogElementsMap().forEach((dialogElement) => {
        const {dom} = dialogElement;
        if(!dom.unreadAvatarBadge) {
          return;
        }

        dialogElement.toggleBadgeByKey('unreadAvatarBadge', false, false, false);
      });

      return;
    }

    const reuseClassNames = ['unread', 'mention'];
    this.sortedList.getAllDialogElementsMap().forEach((dialogElement) => {
      const {dom} = dialogElement;
      const unreadContent = dom.unreadBadge?.textContent;
      if(
        !unreadContent ||
        dom.unreadBadge.classList.contains('backwards') ||
        dom.unreadBadge.classList.contains('dialog-pinned-icon')
      ) {
        return;
      }

      const isUnreadAvatarBadgeMounted = !!dom.unreadAvatarBadge;
      dialogElement.createUnreadAvatarBadge();
      dialogElement.toggleBadgeByKey('unreadAvatarBadge', true, isUnreadAvatarBadgeMounted);
      dom.unreadAvatarBadge.textContent = unreadContent;
      const unreadAvatarBadgeClassList = dom.unreadAvatarBadge.classList;
      const unreadBadgeClassList = dom.unreadBadge.classList;
      reuseClassNames.forEach((className) => {
        unreadAvatarBadgeClassList.toggle(className, unreadBadgeClassList.contains(className));
      });
    });
  }

  public getDialogKey(dialog: Dialog) {
    return dialog.peerId;
  }

  public getDialogKeyFromElement(element: HTMLElement) {
    return +element.dataset.peerId;
  }

  public getDialogFromElement(element: HTMLElement) {
    return rootScope.managers.appMessagesManager.getDialogOnly(element.dataset.peerId.toPeerId());
  }

  protected canUpdateDialog(dialog: Dialog): boolean {
    if(dialog.migratedTo !== undefined || !this.testDialogForFilter(dialog)) return false;
    return super.canUpdateDialog(dialog);
  }

  private async onHasArchiveDialogChanged(hasArchiveDialog: boolean) {
    if(!this.customPinnedDialog || !this.archiveDialogState) return;

    if(hasArchiveDialog) {
      await this.sortedList.ensurePinned(this.customPinnedDialog);
    } else {
      this.sortedList.removePinned(this.customPinnedDialog);
    }
  }

  public clear(): void {
    ++this.communityProjectionGeneration;
    this.communityProjectionPromise = Promise.resolve();
    for(const row of this.communityProjectionRows.values()) {
      row.destroy();
    }
    this.communityProjectionRows.clear();
    this.projectedPeerIds.clear();
    this.projectedPeerFolderIds.clear();
    super.clear();
  }

  public destroy(): void {
    this.communityProjectionDestroyed = true;
    this.communityProjectionDispose?.();
    this.communityProjectionDispose = undefined;
    super.destroy();
    this.archiveDialogState?.dispose();
  }
}
