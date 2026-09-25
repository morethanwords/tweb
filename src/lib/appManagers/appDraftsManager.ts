/*
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import {MessageEntity, DraftMessage, MessagesSaveDraft, InputReplyTo, InputRichMessage} from '@layer';
import tsNow from '@helpers/tsNow';
import assumeType from '@helpers/assumeType';
import {AppManager} from '@appManagers/manager';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import isEphemeralMessageId from '@appManagers/utils/messageId/isEphemeralMessageId';
import draftsAreEqual from '@appManagers/utils/drafts/draftsAreEqual';
import isObject from '@helpers/object/isObject';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import createSerializedQueue, {SerializedQueue} from '@helpers/createSerializedQueue';
import ctx from '@environment/ctx';

export type MyDraftMessage = DraftMessage.draftMessage;

type SyncDraftArgs = {
  peerId: PeerId;
  threadId?: number;
  monoforumThreadId?: PeerId;
  localDraft?: DraftMessage;
  inputRichMessage?: InputRichMessage.inputRichMessage;
  saveOnServer?: boolean;
  force?: boolean;
};

type ClearDraftArgs = {
  peerId: PeerId;
  threadId?: number;
  monoforumThreadId?: PeerId;
};

type DraftSyncState = {
  id: number;
  status: 'failed' | 'pending';
  queue: SerializedQueue;
};

const DRAFT_SYNC_UPDATE_GRACE = 2000;

export class AppDraftsManager extends AppManager {
  private drafts: {[peerIdAndThreadId: string]: MyDraftMessage};
  private draftSyncId = 0;
  private draftSyncStates = new Map<string, DraftSyncState>();
  private draftSyncProtectedUntil = new Map<string, number>();
  private draftSyncProtectionTimeouts = new Map<string, number>();
  private draftSyncReconcileKeys = new Set<string>();
  private draftSyncReconcileTimeout: number;
  private getAllDraftPromise: Promise<void>;
  private getAllDraftsResolved = false;

  protected after() {
    this.clear(true);

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateDraftMessage: (update) => {
        const peerId = this.appPeersManager.getPeerId(update.peer);
        const isNotMe = peerId !== this.rootScope.myId;

        const {draft, threadId} = update;

        let monoforumThreadId: PeerId;
        if(isNotMe && update.saved_peer_id && draft._ === 'draftMessage') {
          monoforumThreadId = this.appPeersManager.getPeerId(update.saved_peer_id);

          if(draft.reply_to?._ === 'inputReplyToMessage' || draft.reply_to?._ === 'inputReplyToMonoForum') {
            draft.reply_to.monoforum_peer_id = monoforumThreadId;
          } else if(!draft.reply_to) {
            draft.reply_to = {
              _: 'inputReplyToMonoForum',
              monoforum_peer_id: this.appPeersManager.getInputPeerById(monoforumThreadId)
            };
          }
        }

        const key = this.getKey(peerId, monoforumThreadId || threadId || update.top_msg_id);
        if(this.isDraftSyncProtected(key)) {
          // Another session may have written this draft while our own save was
          // in flight. Dropping the update keeps the local text, but the server
          // state is then unknown — re-read it once the window closes.
          this.scheduleDraftSyncReconcile(key);
          return;
        }

        this.saveDraft({
          peerId,
          threadId: threadId || update.top_msg_id,
          monoforumThreadId,
          draft,
          notify: true
        });
      }
    });

    /* return  */this.appStateManager.storage.get('drafts').then((drafts) => {
      this.drafts = drafts || {};
      for(const key in this.drafts) {
        this.saveRichMessageMedia(this.drafts[key]);
      }
    });
  }

  public clear = (init?: boolean) => {
    this.draftSyncStates.clear();
    this.draftSyncProtectedUntil.clear();
    this.draftSyncProtectionTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.draftSyncProtectionTimeouts.clear();
    this.draftSyncReconcileKeys.clear();
    if(this.draftSyncReconcileTimeout !== undefined) {
      clearTimeout(this.draftSyncReconcileTimeout);
      this.draftSyncReconcileTimeout = undefined;
    }

    if(!init) {
      this.getAllDraftPromise = undefined;
      this.getAllDraftsResolved = false;
    }

    this.drafts = {};
  };

  private getKey(peerId: PeerId, threadId?: number) {
    return '' + peerId + (threadId ? '_' + threadId : '');
  }

  private isDraftSyncProtected(key: string) {
    if(this.draftSyncStates.get(key)?.status === 'pending') return true;

    const protectedUntil = this.draftSyncProtectedUntil.get(key);
    if(!protectedUntil) return false;
    if(protectedUntil > Date.now()) return true;

    // A throttled worker can run the expiry timer late.
    this.releaseDraftSyncProtection(key);
    return false;
  }

  /**
   * Holds off incoming draft updates for a moment after our own write, so the
   * server echoing it back cannot overwrite what is being typed. Every entry
   * expires on its own — the map must not grow with one record per chat.
   */
  private protectDraftSync(key: string) {
    this.draftSyncProtectedUntil.set(key, Date.now() + DRAFT_SYNC_UPDATE_GRACE);

    const pendingTimeout = this.draftSyncProtectionTimeouts.get(key);
    if(pendingTimeout !== undefined) clearTimeout(pendingTimeout);
    this.draftSyncProtectionTimeouts.set(key, ctx.setTimeout(() => {
      this.releaseDraftSyncProtection(key);
    }, DRAFT_SYNC_UPDATE_GRACE));
  }

  private releaseDraftSyncProtection(key: string) {
    const pendingTimeout = this.draftSyncProtectionTimeouts.get(key);
    if(pendingTimeout !== undefined) clearTimeout(pendingTimeout);
    this.draftSyncProtectionTimeouts.delete(key);
    this.draftSyncProtectedUntil.delete(key);
  }

  private scheduleDraftSyncReconcile(key: string) {
    this.draftSyncReconcileKeys.add(key);
    this.draftSyncReconcileTimeout ??= ctx.setTimeout(
      this.reconcileDroppedDrafts,
      DRAFT_SYNC_UPDATE_GRACE
    );
  }

  private reconcileDroppedDrafts = () => {
    this.draftSyncReconcileTimeout = undefined;
    if(!this.draftSyncReconcileKeys.size) return;

    // Still typing: a newer save re-armed the protection and the refetched
    // update would be dropped again. Wait it out instead of asking twice.
    if([...this.draftSyncReconcileKeys].some((key) => this.isDraftSyncProtected(key))) {
      this.draftSyncReconcileTimeout = ctx.setTimeout(
        this.reconcileDroppedDrafts,
        DRAFT_SYNC_UPDATE_GRACE
      );
      return;
    }

    this.draftSyncReconcileKeys.clear();
    this.requestAllDrafts().catch(() => {});
  };

  public getDraft(peerId: PeerId, threadId?: number) {
    return this.drafts[this.getKey(peerId, threadId)];
  }

  // private generateDialog(peerId: PeerId) {
  //   const dialog = this.dialogsStorage.generateDialog(peerId);
  //   dialog.draft = this.drafts[peerId];
  //   this.dialogsStorage.saveDialog(dialog);
  //   this.appMessagesManager.newDialogsToHandle[peerId] = dialog;
  //   this.appMessagesManager.scheduleHandleNewDialogs();
  // }

  public addMissedDialogsOrVoid() {
    if(this.getAllDraftsResolved) return;
    return this.addMissedDialogs();
  }

  public addMissedDialogs() {
    return this.getAllDrafts().then(() => {
      this.getAllDraftsResolved = true;

      // MTProtoMessagePort.getInstance<false>().invoke('log', {m: '[my-debug] drafts', drafts: this.drafts})
      for(const key in this.drafts) {
        if(key.indexOf('_') !== -1) { // exclude threads
          const peerId = key.split('_')[0]?.toPeerId() || 0;
          this.monoforumDialogsStorage.checkPreloadedDraft(peerId, this.drafts[key]);
          continue;
        }

        const peerId = key.toPeerId();
        const dialog = this.appMessagesManager.getDialogOnly(peerId);
        if(!dialog) {
          this.appMessagesManager.reloadConversation(peerId);
          // this.generateDialog(peerId);
        }
      }
    });
  }

  private requestAllDrafts() {
    return this.apiManager.invokeApi('messages.getAllDrafts')
    .then((updates) => {
      const p = this.apiUpdatesManager.updatesState.syncLoading || Promise.resolve();
      return p.then(() => {
        this.apiUpdatesManager.processUpdateMessage(updates);
      });
    });
  }

  private getAllDrafts() {
    return this.getAllDraftPromise ??= this.requestAllDrafts();
  }

  public saveDraft({
    peerId,
    threadId,
    monoforumThreadId,
    draft: apiDraft,
    notify,
    force
  }: {
    peerId: PeerId,
    threadId?: number,
    monoforumThreadId?: PeerId,
    draft: DraftMessage,
    notify?: boolean,
    force?: boolean
  }) {
    const draft = this.processApiDraft(apiDraft, peerId);

    const key = this.getKey(peerId, monoforumThreadId || threadId);
    if(draft) {
      this.drafts[key] = draft;
    } else {
      delete this.drafts[key];
    }

    this.appStateManager.storage.set({
      drafts: this.drafts
    });

    if(notify) {
      // console.warn(dT(), 'save draft', peerId, apiDraft, options)
      this.rootScope.dispatchEvent('draft_updated', {
        peerId,
        threadId,
        monoforumThreadId,
        draft,
        force
      });
    }

    return draft;
  }

  private isEmptyDraft(draft: DraftMessage) {
    if(draft?._ !== 'draftMessage') {
      return true;
    }

    if(draft.reply_to !== undefined && (draft.reply_to as InputReplyTo.inputReplyToMessage).reply_to_msg_id > 0) {
      return false;
    }

    if(draft.rich_message?.blocks?.length) {
      return false;
    }

    if(!draft.message.length) {
      return true;
    }

    return false;
  }

  private processApiDraft(draft: DraftMessage, peerId: PeerId): MyDraftMessage {
    if(draft?._ !== 'draftMessage') {
      return undefined;
    }

    this.saveRichMessageMedia(draft);

    const replyTo = draft.reply_to as InputReplyTo.inputReplyToMessage;
    if(replyTo?.reply_to_msg_id) {
      const channelId = this.appPeersManager.isChannel(peerId) ? peerId.toChatId() : undefined;
      replyTo.reply_to_msg_id = this.appMessagesIdsManager.generateMessageId(replyTo.reply_to_msg_id, channelId);
      replyTo.top_msg_id &&= this.appMessagesIdsManager.generateMessageId(replyTo.top_msg_id, channelId);
      replyTo.reply_to_peer_id &&= this.appPeersManager.getPeerId(replyTo.reply_to_peer_id);
      replyTo.monoforum_peer_id &&= this.appPeersManager.getPeerId(replyTo.monoforum_peer_id);
    }

    return draft;
  }

  private saveRichMessageMedia(draft: DraftMessage) {
    if(draft?._ === 'draftMessage' && draft.rich_message) {
      draft.rich_message.documents = (draft.rich_message.documents || [])
      .map((document) => this.appDocsManager.saveDoc(document))
      .filter(Boolean);
      draft.rich_message.photos = (draft.rich_message.photos || [])
      .map((photo) => this.appPhotosManager.savePhoto(photo))
      .filter(Boolean);
    }
  }

  public syncDraft({peerId, threadId, monoforumThreadId, localDraft, inputRichMessage, saveOnServer = true, force = false}: SyncDraftArgs) {
    // console.warn(dT(), 'sync draft', peerID)
    const key = this.getKey(peerId, monoforumThreadId || threadId);
    const serverDraft = this.drafts[key];
    if(
      draftsAreEqual(serverDraft, localDraft) &&
      (!saveOnServer || this.draftSyncStates.get(key)?.status !== 'failed')
    ) {
      // console.warn(dT(), 'equal drafts', localDraft, serverDraft)
      return true;
    }

    // console.warn(dT(), 'changed draft', localDraft, serverDraft)
    const params: MessagesSaveDraft = {
      peer: this.appPeersManager.getInputPeerById(peerId),
      message: ''
    };

    let draftObj: DraftMessage;
    if(this.isEmptyDraft(localDraft)) {
      draftObj = {_: 'draftMessageEmpty'};

      let monoforumPeerId = monoforumThreadId;
      if(!monoforumPeerId && (this.appPeersManager.isMonoforum(peerId) && (serverDraft?.reply_to?._ === 'inputReplyToMessage' || serverDraft?.reply_to?._ === 'inputReplyToMonoForum')))
        monoforumPeerId = getPeerId(serverDraft.reply_to.monoforum_peer_id);

      if(monoforumPeerId)
        params.reply_to = {
          _: 'inputReplyToMonoForum',
          monoforum_peer_id: this.appPeersManager.getInputPeerById(monoforumPeerId)
        };
    } else {
      assumeType<DraftMessage.draftMessage>(localDraft);
      const message = localDraft.message;
      const entities: MessageEntity[] = localDraft.entities;

      const replyTo = localDraft.reply_to as InputReplyTo.inputReplyToMessage;
      const isEphemeralReply = replyTo && (
        !Number.isInteger(replyTo.reply_to_msg_id) ||
        isEphemeralMessageId(replyTo.reply_to_msg_id) ||
        this.appMessagesManager.isEphemeralMessage(
          this.appMessagesManager.getMessageByPeer(peerId, replyTo.reply_to_msg_id)
        )
      );
      if(replyTo && !isEphemeralReply) {
        params.reply_to = {
          _: 'inputReplyToMessage',
          reply_to_msg_id: getServerMessageId(replyTo.reply_to_msg_id),
          poll_option: replyTo.poll_option
        };

        if(replyTo.reply_to_peer_id && !isObject(replyTo.reply_to_peer_id)) {
          params.reply_to.reply_to_peer_id = this.appPeersManager.getInputPeerById(replyTo.reply_to_peer_id);
        }

        if(replyTo.monoforum_peer_id && !isObject(replyTo.monoforum_peer_id)) {
          params.reply_to.monoforum_peer_id = this.appPeersManager.getInputPeerById(replyTo.monoforum_peer_id);
        }
      } else if(monoforumThreadId) {
        params.reply_to = {
          _: 'inputReplyToMonoForum',
          monoforum_peer_id: this.appPeersManager.getInputPeerById(monoforumThreadId)
        }
      }

      if(entities?.length) {
        params.entities = this.appMessagesManager.getInputEntities(entities);
      }

      if(localDraft.pFlags.no_webpage) {
        params.no_webpage = localDraft.pFlags.no_webpage;
      }

      if(localDraft.pFlags.invert_media) {
        params.invert_media = localDraft.pFlags.invert_media;
      }

      if(localDraft.media) {
        params.media = localDraft.media;
      }

      params.message = message;
    }

    if(threadId) {
      const inputReplyTo: InputReplyTo.inputReplyToMessage = params.reply_to ??= {_: 'inputReplyToMessage'} as any;
      if(!inputReplyTo.reply_to_msg_id) {
        inputReplyTo.reply_to_msg_id = getServerMessageId(threadId);
      } else {
        inputReplyTo.top_msg_id = getServerMessageId(threadId);
      }
    }

    const saveLocalDraft = draftObj || localDraft;
    saveLocalDraft.date = this.timeManager.getServerTime();

    this.saveDraft({
      peerId,
      threadId,
      monoforumThreadId,
      draft: saveLocalDraft,
      notify: true,
      force
    });

    if(saveOnServer) {
      const syncId = ++this.draftSyncId;
      const queue = this.draftSyncStates.get(key)?.queue || createSerializedQueue();
      this.draftSyncStates.set(key, {id: syncId, status: 'pending', queue});

      let promise: Promise<unknown>;
      try {
        let resolvedInputRichMessage: InputRichMessage.inputRichMessage;
        if(inputRichMessage) {
          resolvedInputRichMessage = this.appMessagesManager.resolveInputRichMessage(inputRichMessage);
          params.rich_message = resolvedInputRichMessage;
        }

        // Validation and reference refresh can finish after a newer draft. Check at
        // dispatch time, and serialize requests already sent for this draft key.
        const invoke = () => queue.enqueue(() => {
          if(this.draftSyncStates.get(key)?.id !== syncId) return;
          return this.apiManager.invokeApi('messages.saveDraft', params);
        });
        promise = resolvedInputRichMessage ?
          this.appMessagesManager.assertRichMessage(resolvedInputRichMessage, {draft: true}).then(() => {
            return this.appMessagesManager.invokeWithRichMessageReferenceRetry(
              resolvedInputRichMessage,
              invoke
            );
          }) :
          invoke();
      } catch(error) {
        promise = Promise.reject(error);
      }

      promise = promise.then((result) => {
        if(this.draftSyncStates.get(key)?.id === syncId) {
          this.draftSyncStates.delete(key);
          this.protectDraftSync(key);
        }

        return result;
      }, (error) => {
        if(this.draftSyncStates.get(key)?.id === syncId) {
          this.draftSyncStates.set(key, {id: syncId, status: 'failed', queue});
        }

        throw error;
      });

      const dialog = this.dialogsStorage.getDialogOnly(peerId); // * create or delete dialog when draft changes
      if(!dialog || !getServerMessageId(dialog.top_message)) {
        return promise.then(() => {
          return this.appMessagesManager.reloadConversation(peerId);
        });
      }

      return promise;
    }

    // Local clearing after send cancels preparation, but retains the queue until
    // any already dispatched write settles so a new draft cannot overtake it.
    const previousSync = this.draftSyncStates.get(key);
    if(previousSync) {
      const id = ++this.draftSyncId;
      const {queue} = previousSync;
      this.draftSyncStates.set(key, {id, status: 'pending', queue});
      void queue.enqueue(() => {
        if(this.draftSyncStates.get(key)?.id !== id) return;
        this.draftSyncStates.delete(key);
        this.protectDraftSync(key);
      });
    }
    return true;
  }

  public clearAllDrafts() {
    return this.apiManager.invokeApi('messages.clearAllDrafts').then((bool) => {
      if(!bool) {
        return;
      }

      for(const combined in this.drafts) {
        const [peerId, strThreadId] = combined.split('_');
        const threadId = strThreadId ? +strThreadId : undefined;

        this.rootScope.dispatchEvent('draft_updated', {
          peerId: peerId.toPeerId(),
          ...(this.appPeersManager.isMonoforum(peerId.toPeerId()) ?
            {threadId} :
            {monoforumThreadId: threadId}
          ),
          draft: undefined
        });
      }
    });
  }

  public clearDraft({peerId, threadId, monoforumThreadId}: ClearDraftArgs) {
    const emptyDraft: DraftMessage.draftMessageEmpty = {
      _: 'draftMessageEmpty'
    };

    if(threadId) {
      this.syncDraft({peerId, threadId, monoforumThreadId, localDraft: emptyDraft as any, saveOnServer: false, force: true});
    } else {
      this.saveDraft({
        peerId,
        threadId,
        monoforumThreadId,
        draft: emptyDraft,
        notify: true,
        force: true
      });
    }
  }

  public setDraft(peerId: PeerId, threadId: number, message: string, entities?: MessageEntity[]) {
    const draft: DraftMessage.draftMessage = {
      _: 'draftMessage',
      date: tsNow(true),
      message,
      pFlags: {},
      entities
    };

    if(threadId) {
      this.syncDraft({peerId, threadId, localDraft: draft, saveOnServer: false, force: true});
    } else {
      this.saveDraft({
        peerId,
        threadId,
        draft,
        notify: true,
        force: true
      });
    }
  }
}
