import type {
  ConversationPreview,
  Dialog,
  MyMessage
} from '@appManagers/appMessagesManager';
import {isDialog} from '@appManagers/utils/dialogs/isDialog';
import {
  AutonomousDialogListBase,
  BaseConstructorArgs
} from '@components/autonomousDialogList/base';
import {ChatType} from '@components/chat/chatType';
import type {
  CommunityLinkedChat
} from '@components/forumTab/communityChatsModel';
import type {Middleware} from '@helpers/middleware';
import noop from '@helpers/noop';
import positionElementByIndex from '@helpers/dom/positionElementByIndex';
import type {
  AppDialogsManager,
  DialogElement
} from '@lib/appDialogsManager';
import createCommunityDialogElement
from '@components/autonomousDialogList/createCommunityDialogElement';
import Icon from '@components/icon';
import {
  getCommunityServiceTitle
} from '@components/wrappers/getCommunityServiceMessageKey';
import appImManager from '@lib/appImManager';
import rootScope from '@lib/rootScope';
import {useCommunity} from '@stores/communities';
import {createEffect, createRoot, on} from 'solid-js';
import styles from '@components/forumTab/communityChats.module.scss';

export type CommunityDialogListKind = Extract<
  CommunityLinkedChat['kind'],
  'joined' | 'viewable'
>;

export type CommunityDialogListItem = CommunityLinkedChat & {
  kind: CommunityDialogListKind
};

type AddListDialogOptions = Parameters<
  AppDialogsManager['addListDialog']
>[0];

type ConstructorArgs = BaseConstructorArgs & {
  communityId: ChatId,
  middleware: Middleware
};

export class AutonomousCommunityDialogList
  extends AutonomousDialogListBase<Dialog> {
  public readonly communityId: ChatId;

  private readonly dialogElements = new Map<PeerId, DialogElement>();
  private readonly items = new Map<PeerId, CommunityDialogListItem>();
  private readonly itemPositions = new Map<PeerId, number>();
  private readonly dialogInitPromises = new Map<
    PeerId,
    Promise<unknown>
  >();
  private readonly previewDates = new Map<PeerId, number>();
  private readonly previewGenerations = new Map<PeerId, number>();
  private readonly previewMids = new Map<PeerId, number>();
  private readonly previewPromises = new Map<PeerId, Promise<void>>();
  private readonly previewHydrationPeerIds = new Set<PeerId>();
  private readonly forcedPreviewHydrationPeerIds = new Set<PeerId>();
  private readonly previewHydrationGenerations = new Map<PeerId, number>();
  private previewHydrationScheduled = false;
  private readonly hiddenPeerIcons = new Map<PeerId, HTMLElement>();
  private readonly previewCommunitySubscriptions = new Map<
    PeerId,
    {
      communityId: ChatId,
      dispose: VoidFunction,
      mid: number
    }
  >();
  private readonly lists: Record<CommunityDialogListKind, HTMLUListElement>;
  private readonly middleware: Middleware;

  constructor({
    communityId,
    middleware,
    ...options
  }: ConstructorArgs) {
    super(options);

    this.communityId = communityId;
    this.middleware = middleware;
    this.middleware.onClean(() => {
      this.previewHydrationPeerIds.clear();
      this.forcedPreviewHydrationPeerIds.clear();
      this.previewHydrationGenerations.clear();
      for(const peerId of this.previewCommunitySubscriptions.keys()) {
        this.clearCommunityPreviewSubscription(peerId);
      }
    });
    this.lists = {
      joined: this.appDialogsManager.createChatList(),
      viewable: this.appDialogsManager.createChatList()
    };

    for(const kind of ['joined', 'viewable'] as const) {
      const list = this.lists[kind];
      list.dataset.communitySection = kind;
      this.appDialogsManager.setListClickListener({
        list,
        withContext: true
      });
    }

    this.listenerSetter.add(appImManager)('peer_changed', (chat) => {
      for(const [peerId, dialogElement] of this.dialogElements) {
        this.syncDialogActive(peerId, dialogElement, chat);
      }
    });

    this.listenerSetter.add(rootScope)('peer_typings', async({
      peerId,
      typings
    }) => {
      if(!this.dialogElements.has(peerId)) {
        return;
      }

      const dialog = await this.managers.appMessagesManager
      .getDialogOnly(peerId)
      .catch((): undefined => undefined);
      if(!dialog) {
        return;
      }

      if(typings.length) {
        await this.setTyping(dialog).catch(noop);
      } else {
        this.unsetTyping(dialog);
      }
    });

    this.listenerSetter.add(rootScope)('dialog_flush', ({dialog}) => {
      if(isDialog(dialog)) {
        this.updateDialog(dialog);
      }
    });

    this.listenerSetter.add(rootScope)('dialogs_multiupdate', (dialogs) => {
      for(const [, {dialog}] of dialogs) {
        if(isDialog(dialog)) {
          this.updateDialog(dialog);
        }
      }
    });

    this.listenerSetter.add(rootScope)('dialog_unread', ({dialog}) => {
      if(isDialog(dialog)) {
        this.updateDialog(dialog);
      }
    });

    this.listenerSetter.add(rootScope)('dialog_notify_settings', (dialog) => {
      if(isDialog(dialog)) {
        this.updateDialog(dialog);
      }
    });

    this.listenerSetter.add(rootScope)('dialog_draft', ({dialog}) => {
      if(isDialog(dialog)) {
        this.updateDialog(dialog);
      }
    });

    this.listenerSetter.add(rootScope)('dialog_drop', (dialog) => {
      if(isDialog(dialog) && this.dialogElements.has(dialog.peerId)) {
        const promise = this.appDialogsManager.initDialog(
          this.dialogElements.get(dialog.peerId),
          this.getDialogOptions(dialog.peerId)
        );
        this.dialogInitPromises.set(dialog.peerId, promise);
        void promise.catch(noop);
      }
    });

    const updateHistoryPreview = (message: MyMessage) => {
      const dialogElement = this.dialogElements.get(message.peerId);
      if(
        !dialogElement ||
        dialogElement.dom.listEl.dataset.communityChatKind !== 'viewable'
      ) {
        return;
      }

      const currentMid = this.previewMids.get(message.peerId) || 0;
      if(currentMid && message.mid < currentMid) {
        return;
      }

      const generation = this.bumpPreviewGeneration(message.peerId);
      this.previewMids.set(message.peerId, message.mid);
      void this.setViewablePreview(
        message.peerId,
        message,
        generation
      ).catch(noop);
    };
    this.listenerSetter.add(rootScope)('history_append', ({message}) => {
      updateHistoryPreview(message);
    });
    this.listenerSetter.add(rootScope)('history_update', ({message}) => {
      updateHistoryPreview(message);
    });
    this.listenerSetter.add(rootScope)('history_multiappend', (message) => {
      updateHistoryPreview(message);
    });
    this.listenerSetter.add(rootScope)('history_delete', ({
      peerId,
      msgs
    }) => {
      const dialogElement = this.dialogElements.get(peerId);
      const previewMid = this.previewMids.get(peerId);
      if(
        previewMid &&
        msgs.has(previewMid) &&
        dialogElement?.dom.listEl.dataset.communityChatKind === 'viewable'
      ) {
        this.queueViewablePreviewHydration(peerId, true);
      }
    });

    this.listenerSetter.add(rootScope)('user_update', async(userId) => {
      const peerId = userId.toPeerId();
      const dialogElement = this.dialogElements.get(peerId);
      if(!dialogElement?.dom.avatarEl?.node) {
        return;
      }

      const status = await this.managers.appUsersManager
      .getUserStatus(userId)
      .catch((): undefined => undefined);
      if(this.dialogElements.get(peerId) === dialogElement) {
        this.appDialogsManager.xd?.setOnlineStatus(
          dialogElement.dom.avatarEl.node,
          status?._ === 'userStatusOnline'
        );
      }
    });

    this.listenerSetter.add(rootScope)('chat_update', (chatId) => {
      const peerId = chatId.toPeerId(true);
      const dialogElement = this.dialogElements.get(peerId);
      if(dialogElement) {
        this.appDialogsManager.xd?.processDialogForCallStatus(
          peerId,
          dialogElement.dom
        );
      }
    });

    this.listenerSetter.add(rootScope)(
      'auto_delete_period_update',
      ({peerId, period}) => {
        this.dialogElements.get(peerId)?.dom.avatarEl?.setAutoDeletePeriod(
          period
        );
      }
    );
  }

  private getDialogOptions(peerId: PeerId): AddListDialogOptions {
    return {
      peerId,
      isBatch: true,
      isMainList: false,
      controlled: true,
      dontSetActive: true,
      meAsSaved: true,
      wrapOptions: {middleware: this.middleware}
    };
  }

  private removeDialogElement(
    peerId: PeerId,
    dialogElement: DialogElement
  ) {
    this.hiddenPeerIcons.get(peerId)?.remove();
    this.hiddenPeerIcons.delete(peerId);
    this.dialogElements.delete(peerId);
    this.items.delete(peerId);
    this.itemPositions.delete(peerId);
    this.previewDates.delete(peerId);
    this.previewGenerations.delete(peerId);
    this.previewMids.delete(peerId);
    this.previewPromises.delete(peerId);
    this.previewHydrationPeerIds.delete(peerId);
    this.forcedPreviewHydrationPeerIds.delete(peerId);
    this.previewHydrationGenerations.delete(peerId);
    this.dialogInitPromises.delete(peerId);
    this.clearCommunityPreviewSubscription(peerId);
    this.appDialogsManager.setDialogActive(
      dialogElement.dom.listEl,
      false
    );
    dialogElement.remove();
  }

  private syncDialogActive(
    peerId: PeerId,
    dialogElement: DialogElement,
    chat = appImManager.chat
  ) {
    const active = !!chat &&
      appImManager.isSamePeer(chat, {
        peerId,
        type: ChatType.Chat
      });
    this.appDialogsManager.setDialogActive(
      dialogElement.dom.listEl,
      active
    );
  }

  private syncHiddenPeerIcon(
    item: CommunityDialogListItem,
    dialogElement: DialogElement
  ) {
    let icon = this.hiddenPeerIcons.get(item.peerId);
    if(item.linked.visible !== false) {
      icon?.remove();
      this.hiddenPeerIcons.delete(item.peerId);
      return;
    }

    if(!icon) {
      icon = Icon(
        'eye2_filled',
        'inline-icon',
        'inline-icon-right',
        styles.HiddenPeerIcon
      );
      this.hiddenPeerIcons.set(item.peerId, icon);
    }

    const {mutedIcon, titleSpanContainer} = dialogElement.dom;
    const before = mutedIcon?.parentElement === titleSpanContainer ?
      mutedIcon :
      null;
    // reinserting an already placed icon would restart its animations
    if(
      icon.parentElement !== titleSpanContainer ||
      icon.nextSibling !== before
    ) {
      titleSpanContainer.insertBefore(icon, before);
    }
  }

  private sortList(kind: CommunityDialogListKind) {
    const list = this.lists[kind];
    const items = [...this.items.values()]
    .filter((item) => item.kind === kind)
    .sort((a, b) => {
      if(kind === 'viewable') {
        const dateDelta = (this.previewDates.get(b.peerId) || 0) -
          (this.previewDates.get(a.peerId) || 0);
        if(dateDelta) {
          return dateDelta;
        }
      }

      return (this.itemPositions.get(a.peerId) || 0) -
        (this.itemPositions.get(b.peerId) || 0);
    });

    // position, don't reappend: moving a row that is already in place would
    // detach it from the DOM and restart everything rendered inside it
    let position = 0;
    for(const item of items) {
      const dialogElement = this.dialogElements.get(item.peerId);
      if(dialogElement) {
        positionElementByIndex(dialogElement.dom.listEl, list, position++);
      }
    }
  }

  private async setViewablePreview(
    peerId: PeerId,
    lastMessage: MyMessage,
    generation: number
  ) {
    const dialogElement = this.dialogElements.get(peerId);
    if(
      !dialogElement ||
      dialogElement.dom.listEl.dataset.communityChatKind !== 'viewable'
    ) {
      return;
    }

    await this.dialogInitPromises.get(peerId)?.catch(noop);
    const dialog = this.items.get(peerId)?.dialog || {
      _: 'dialog',
      peerId,
      pFlags: {}
    } as Dialog;
    if(
      this.previewGenerations.get(peerId) !== generation ||
      this.dialogElements.get(peerId) !== dialogElement ||
      dialogElement.dom.listEl.dataset.communityChatKind !== 'viewable'
    ) {
      return;
    }

    await this.appDialogsManager.setLastMessageN({
      dialog,
      dialogElement,
      lastMessage,
      setUnread: true
    });
    if(
      this.previewGenerations.get(peerId) === generation &&
      this.dialogElements.get(peerId) === dialogElement
    ) {
      this.previewMids.set(peerId, lastMessage.mid);
      this.previewDates.set(peerId, lastMessage.date);
      this.syncCommunityPreviewSubscription(
        peerId,
        lastMessage,
        dialogElement
      );
      this.sortList('viewable');
    }
  }

  private clearCommunityPreviewSubscription(peerId: PeerId) {
    const subscription = this.previewCommunitySubscriptions.get(peerId);
    if(!subscription) {
      return;
    }

    this.previewCommunitySubscriptions.delete(peerId);
    subscription.dispose();
  }

  private syncCommunityPreviewSubscription(
    peerId: PeerId,
    message: MyMessage,
    dialogElement: DialogElement
  ) {
    const action = message._ === 'messageService' ?
      message.action :
      undefined;
    const communityId = action?._ === 'messageActionChangeCommunity' &&
      action.community_id !== undefined &&
      action.community_id !== 0 &&
      action.community_id !== '0' ?
      Math.abs(+action.community_id) as ChatId :
      undefined;
    const current = this.previewCommunitySubscriptions.get(peerId);
    if(
      communityId === undefined ||
      dialogElement.dom.listEl.dataset.communityChatKind !== 'viewable'
    ) {
      this.clearCommunityPreviewSubscription(peerId);
      return;
    }
    if(
      current?.communityId === communityId &&
      current.mid === message.mid
    ) {
      return;
    }

    this.clearCommunityPreviewSubscription(peerId);
    const dispose = createRoot((dispose) => {
      const community = useCommunity(() => communityId);
      createEffect(on(
        () => getCommunityServiceTitle(community()) || '',
        () => {
          if(
            this.previewMids.get(peerId) !== message.mid ||
            this.dialogElements.get(peerId) !== dialogElement ||
            dialogElement.dom.listEl.dataset.communityChatKind !== 'viewable'
          ) {
            return;
          }

          void this.setViewablePreview(
            peerId,
            message,
            this.bumpPreviewGeneration(peerId)
          );
        },
        {defer: true}
      ));
      return dispose;
    });
    this.previewCommunitySubscriptions.set(peerId, {
      communityId,
      dispose,
      mid: message.mid
    });
  }

  private bumpPreviewGeneration(peerId: PeerId) {
    const generation = (this.previewGenerations.get(peerId) || 0) + 1;
    this.previewGenerations.set(peerId, generation);
    return generation;
  }

  private async clearViewablePreview(
    peerId: PeerId,
    generation: number
  ) {
    const dialogElement = this.dialogElements.get(peerId);
    if(
      !this.previewMids.has(peerId) ||
      this.previewGenerations.get(peerId) !== generation ||
      dialogElement?.dom.listEl.dataset.communityChatKind !== 'viewable'
    ) {
      return;
    }

    this.previewMids.delete(peerId);
    this.previewDates.delete(peerId);
    this.clearCommunityPreviewSubscription(peerId);
    await this.appDialogsManager.setLastMessageN({
      dialog: {
        _: 'dialog',
        peerId,
        pFlags: {}
      } as Dialog,
      dialogElement,
      setUnread: true
    });
    this.sortList('viewable');
  }

  private queueViewablePreviewHydration(
    peerId: PeerId,
    force = false
  ) {
    if(
      !force &&
      (
        this.previewPromises.has(peerId) ||
        this.previewHydrationPeerIds.has(peerId)
      )
    ) {
      return;
    }

    this.previewHydrationPeerIds.add(peerId);
    this.previewHydrationGenerations.set(
      peerId,
      this.bumpPreviewGeneration(peerId)
    );
    if(force) {
      this.forcedPreviewHydrationPeerIds.add(peerId);
    }
    if(this.previewHydrationScheduled) {
      return;
    }

    this.previewHydrationScheduled = true;
    queueMicrotask(() => this.flushViewablePreviewHydrations());
  }

  private flushViewablePreviewHydrations() {
    this.previewHydrationScheduled = false;
    if(!this.middleware()) {
      return;
    }

    const peerIds = [...this.previewHydrationPeerIds].filter((peerId) => {
      return this.items.get(peerId)?.kind === 'viewable';
    });
    const forcedPeerIds = new Set(this.forcedPreviewHydrationPeerIds);
    const generations = new Map(peerIds.map((peerId) => [
      peerId,
      this.previewHydrationGenerations.get(peerId)
    ]));
    this.previewHydrationPeerIds.clear();
    this.forcedPreviewHydrationPeerIds.clear();
    this.previewHydrationGenerations.clear();
    if(!peerIds.length) {
      return;
    }

    const applyPreviews = async(
      previews: ConversationPreview[],
      clearMissing: boolean
    ) => {
      const previewsByPeerId = new Map(
        previews.map((preview) => [preview.peerId, preview])
      );
      await Promise.all(peerIds.map(async(peerId) => {
        const generation = generations.get(peerId);
        const preview = previewsByPeerId.get(peerId);
        const item = this.items.get(peerId);
        if(
          preview?.dialog &&
          item?.kind === 'viewable' &&
          this.previewGenerations.get(peerId) === generation
        ) {
          item.dialog = preview.dialog;
        }
        if(
          preview?.lastMessage &&
          this.previewMids.get(peerId) !== preview.lastMessage.mid
        ) {
          await this.setViewablePreview(
            peerId,
            preview.lastMessage,
            generation
          );
        } else if(
          clearMissing &&
          !preview?.lastMessage &&
          (
            forcedPeerIds.has(peerId) ||
            this.previewMids.has(peerId)
          )
        ) {
          await this.clearViewablePreview(peerId, generation);
        }
      }));
    };
    const cachedPromise = Promise.resolve(
      this.managers.appMessagesManager.getConversationPreviews(peerIds)
    ).then((previews) => applyPreviews(previews, false)).catch(noop);
    const loadPromise = Promise.resolve(
      this.managers.appMessagesManager.loadConversationPreviews(peerIds)
    ).then((previews) => applyPreviews(previews, true)).catch(noop);
    const promise = Promise.all([
      cachedPromise,
      loadPromise
    ]).then((): void => undefined).finally(() => {
      for(const peerId of peerIds) {
        if(this.previewPromises.get(peerId) === promise) {
          this.previewPromises.delete(peerId);
        }
      }
    });
    for(const peerId of peerIds) {
      this.previewPromises.set(peerId, promise);
    }
  }

  public getList(kind: CommunityDialogListKind) {
    return this.lists[kind];
  }

  public setItems(items: CommunityDialogListItem[]) {
    const nextPeerIds = new Set(items.map((item) => item.peerId));

    for(const [peerId, dialogElement] of this.dialogElements) {
      if(nextPeerIds.has(peerId)) {
        continue;
      }

      this.removeDialogElement(peerId, dialogElement);
    }

    this.items.clear();
    this.itemPositions.clear();
    items.forEach((item, position) => {
      this.items.set(item.peerId, item);
      this.itemPositions.set(item.peerId, position);
    });

    for(const item of items) {
      let dialogElement = this.dialogElements.get(item.peerId);
      let created = false;
      if(!dialogElement) {
        created = true;
        const initialDialog = item.dialog || {
          _: 'dialog',
          peerId: item.peerId,
          pFlags: {}
        } as Dialog;
        dialogElement = createCommunityDialogElement(
          this.appDialogsManager,
          item.peerId,
          {middleware: this.middleware},
          {
            autoDeletePeriod: item.dialog?.ttl_period,
            dialog: initialDialog,
            dontSetActive: item.kind === 'viewable',
            lastMessage: item.kind === 'viewable' ?
              item.lastMessage :
              undefined,
            onInitPromise: (promise) => {
              this.dialogInitPromises.set(item.peerId, promise);
            }
          }
        );
        dialogElement.dom.listEl.dataset.communityId = '' + this.communityId;
        this.dialogElements.set(item.peerId, dialogElement);
      }

      const {listEl} = dialogElement.dom;
      if(listEl.dataset.communityChatKind !== item.kind) {
        listEl.dataset.communityChatKind = item.kind;
      }
      dialogElement.setMuted(!!item.muted, 0);
      dialogElement.dom.avatarEl?.setAutoDeletePeriod(
        item.dialog?.ttl_period || 0
      );
      this.syncHiddenPeerIcon(item, dialogElement);
      this.syncDialogActive(item.peerId, dialogElement);
      if(item.kind === 'viewable') {
        const {lastMessage} = item;
        if(
          lastMessage &&
          this.previewMids.get(item.peerId) !== lastMessage.mid
        ) {
          const generation = this.bumpPreviewGeneration(item.peerId);
          this.previewMids.set(item.peerId, lastMessage.mid);
          if(created) {
            this.previewDates.set(item.peerId, lastMessage.date);
            const initPromise = this.dialogInitPromises.get(item.peerId);
            void initPromise?.then(() => {
              if(
                this.dialogElements.get(item.peerId) === dialogElement &&
                this.previewMids.get(item.peerId) === lastMessage.mid &&
                dialogElement.dom.listEl.dataset.communityChatKind ===
                  'viewable'
              ) {
                this.syncCommunityPreviewSubscription(
                  item.peerId,
                  lastMessage,
                  dialogElement
                );
              }
            }).catch(noop);
          } else {
            void this.setViewablePreview(
              item.peerId,
              lastMessage,
              generation
            ).catch(noop);
          }
        } else if(!item.dialog?.top_message) {
          this.queueViewablePreviewHydration(item.peerId);
        } else if(
          this.previewMids.get(item.peerId) !== item.dialog.top_message
        ) {
          const generation = this.bumpPreviewGeneration(item.peerId);
          this.previewMids.set(item.peerId, item.dialog.top_message);
          void Promise.resolve(
            this.managers.appMessagesManager.getMessageByPeer(
              item.peerId,
              item.dialog.top_message
            )
          ).then(async(message) => {
            if(
              !message &&
              this.previewGenerations.get(item.peerId) === generation &&
              this.previewMids.get(item.peerId) === item.dialog.top_message &&
              this.dialogElements.get(item.peerId) === dialogElement
            ) {
              this.previewMids.delete(item.peerId);
              this.queueViewablePreviewHydration(item.peerId);
              return;
            }
            if(message) {
              await this.setViewablePreview(
                item.peerId,
                message,
                generation
              );
            }
          }).catch(noop);
        }
      } else {
        this.bumpPreviewGeneration(item.peerId);
        this.previewMids.delete(item.peerId);
        this.previewDates.delete(item.peerId);
        this.clearCommunityPreviewSubscription(item.peerId);
      }
    }

    this.sortList('joined');
    this.sortList('viewable');
  }

  public getDialogKey(dialog: Dialog) {
    return dialog.peerId;
  }

  public getDialogKeyFromElement(element: HTMLElement) {
    return +element.dataset.peerId as PeerId;
  }

  public getDialogFromElement(element: HTMLElement) {
    return this.managers.appMessagesManager.getDialogOnly(
      this.getDialogKeyFromElement(element)
    );
  }

  public getDialogElement(peerId: PeerId) {
    return this.dialogElements.get(peerId);
  }

  public updateDialog(dialog: Dialog) {
    const dialogElement = this.dialogElements.get(dialog.peerId);
    if(!dialogElement) {
      return;
    }

    const generation = this.bumpPreviewGeneration(dialog.peerId);
    void this.appDialogsManager.setLastMessageN({
      dialog,
      dialogElement,
      setUnread: true
    }).then(() => {
      if(
        this.previewGenerations.get(dialog.peerId) === generation &&
        dialogElement.dom.listEl.dataset.communityChatKind === 'viewable'
      ) {
        if(dialog.top_message) {
          this.previewMids.set(dialog.peerId, dialog.top_message);
        } else {
          this.previewMids.delete(dialog.peerId);
        }
      }
    });
  }

  public onChatsScroll() {
  }

  public destroy() {
    this.listenerSetter.removeAll();
    for(const [peerId, dialogElement] of this.dialogElements) {
      this.removeDialogElement(peerId, dialogElement);
    }
    this.lists.joined.remove();
    this.lists.viewable.remove();
    this.previewGenerations.clear();
    this.previewMids.clear();
    this.previewPromises.clear();
    this.dialogInitPromises.clear();
  }
}
