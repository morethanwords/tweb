/*
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import {MessageEntity, DraftMessage, MessagesSaveDraft, InputReplyTo, InputRichMessage, Update, Updates} from '@layer';
import type {ReferenceContext} from '@lib/storages/references';
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
import forgetFailedRequest from '@helpers/forgetFailedRequest';
import noop from '@helpers/noop';

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
  /** whether the save under way goes through: `syncDraft`'s answer, for the same draft given again meanwhile too */
  saved?: Promise<boolean>;
  /**
   * ends the save's hold on what the server gives of the draft while its request has not gone yet: a newer save taking
   * its place, or a clear calling it off, means it never will (a preparation of its rich message may never end)
   */
  release?: () => void;
};

/**
 * What this session did with a draft, which what the server gives of it is measured against (tdesktop's
 * History::skipCloudDraftUpdate): while a save is under way the server's copy may predate it, once it has ended one
 * dated before that is older than it, and a read asked for before the draft last changed here may predate the change
 */
type DraftSaves = {
  /** saves under way */
  pending: number;
  /** `draftsClock` as the draft last changed here (a save ended, a draft of the server's was taken) */
  changed: number;
  /** server time: a copy of the server's dated before it is no newer than the last save */
  acceptAfter: number;
};

/** seconds a save's end is given for the clocks: a copy of the server's dated within them is older (tdesktop's kSkipCloudDraftsFor) */
const CLOUD_DRAFT_SKIP_FOR = 2;
/** how long a re-read of the drafts waits, for the drafts left out meanwhile to go in one */
const DRAFT_SYNC_RECONCILE_DELAY = 2000;

export class AppDraftsManager extends AppManager {
  private drafts: {[peerIdAndThreadId: string]: MyDraftMessage};
  private draftSyncId = 0;
  private draftSyncStates = new Map<string, DraftSyncState>();
  private draftSaves = new Map<string, DraftSaves>();
  /** ticks as a draft changes here: a read of what holds drafts notes it as it is asked for (`getDraftsClock`) */
  private draftsClock = 0;
  /** the drafts a read of them brought, with the tick it was asked for at */
  private draftReads = new WeakMap<Update.updateDraftMessage, number>();
  /** the drafts left out, whose chats to ask for again once no save of them is under way */
  private draftSyncReconcileKeys = new Map<string, ClearDraftArgs>();
  private draftSyncReconcileTimeout: number;
  private getAllDraftPromise: Promise<void>;
  private getAllDraftsResolved = false;

  protected after() {
    this.clear(true);

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateDraftMessage: (update) => {
        const {draft} = update;
        const {peerId, threadId, monoforumThreadId} = this.getUpdateDraftTarget(update);
        if(monoforumThreadId && draft._ === 'draftMessage') {
          if(draft.reply_to?._ === 'inputReplyToMessage' || draft.reply_to?._ === 'inputReplyToMonoForum') {
            draft.reply_to.monoforum_peer_id = monoforumThreadId;
          } else if(!draft.reply_to) {
            draft.reply_to = {
              _: 'inputReplyToMonoForum',
              monoforum_peer_id: this.appPeersManager.getInputPeerById(monoforumThreadId)
            };
          }
        }

        const key = this.getKey(peerId, monoforumThreadId || threadId);
        const askedAt = this.draftReads.get(update);
        if(this.skipCloudDraft(key, draft, askedAt)) {
          // * another session may have written it in the same moment as this one saved, after the save
          this.scheduleDraftSyncReconcile(key, {peerId, threadId, monoforumThreadId});
          return;
        }

        this.saveDraft({
          peerId,
          threadId,
          monoforumThreadId,
          draft,
          notify: true,
          askedAt
        });
      }
    });

    /* return  */this.appStateManager.storage.get('drafts').then((drafts) => {
      this.drafts = drafts || {};
      for(const key in this.drafts) {
        const [peerId, threadId] = key.split('_');
        this.saveRichMessageMedia(this.drafts[key], this.getReferenceContext(peerId.toPeerId(), +threadId));
      }
    });
  }

  public clear = (init?: boolean) => {
    this.draftSyncStates.clear();
    this.draftSaves.clear();
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

  /** Whose draft an update carries: a peer's, a topic's or a monoforum thread's */
  private getUpdateDraftTarget(update: Update.updateDraftMessage) {
    const peerId = this.appPeersManager.getPeerId(update.peer);
    // * an empty draft is the thread's too: one cleared elsewhere, or by a message sent there from another device
    const monoforumThreadId = peerId !== this.rootScope.myId && update.saved_peer_id ?
      this.appPeersManager.getPeerId(update.saved_peer_id) :
      undefined;
    // * a channel's topic by its id here, as its saves, its dialog and its field have it
    const {top_msg_id} = update;
    const threadId = update.threadId || (top_msg_id && this.appMessagesIdsManager.generateMessageId(
      top_msg_id,
      this.appPeersManager.isChannel(peerId) ? peerId.toChatId() : undefined
    ));
    return {peerId, threadId, monoforumThreadId};
  }

  /** Where a draft's media came from, for its file references to be renewed from there */
  private getReferenceContext(peerId: PeerId, threadId?: number): ReferenceContext.referenceContextDraft {
    return {type: 'draft', peerId, threadId: threadId || undefined};
  }

  /**
   * The drafts clock's tick: read before asking the server for what holds drafts (the drafts, the dialogs), and
   * handed back with what that brings, which is older than a change of the draft here after it (`skipCloudDraft`)
   */
  public getDraftsClock() {
    return this.draftsClock;
  }

  private getDraftSaves(key: string) {
    let saves = this.draftSaves.get(key);
    if(!saves) this.draftSaves.set(key, saves = {pending: 0, changed: 0, acceptAfter: 0});
    return saves;
  }

  private startDraftSave(key: string) {
    const saves = this.getDraftSaves(key);
    ++saves.pending;
    return saves;
  }

  /** a save has ended, gone through or not: what the server gives of the draft from now on is measured against it */
  private endDraftSave(saves: DraftSaves) {
    --saves.pending;
    saves.changed = ++this.draftsClock;
    saves.acceptAfter = Math.max(saves.acceptAfter, this.timeManager.getServerTime() + CLOUD_DRAFT_SKIP_FOR);
  }

  /**
   * Whether a draft the server gives is older than what this session has of it, and is to be left out: while a save
   * is under way, the server may have taken the save after it; once the saves have ended, one dated before the last
   * ended is older; and one a read brought (`askedAt`, the drafts clock's tick it was asked for at) is older when the
   * draft changed here after the read was asked for - a save ended, or a draft pushed was taken - whatever its date
   * (the server may have answered the read before). A read asked for after that is the server's draft as it stands,
   * its absence included
   */
  private skipCloudDraft(key: string, draft: DraftMessage, askedAt?: number) {
    const saves = this.draftSaves.get(key);
    if(!saves) return false;
    if(saves.pending) return true;
    if(askedAt !== undefined) return askedAt < saves.changed;
    return (draft?.date || 0) < saves.acceptAfter;
  }

  private scheduleDraftSyncReconcile(key: string, target: ClearDraftArgs) {
    this.draftSyncReconcileKeys.set(key, target);
    this.draftSyncReconcileTimeout ??= ctx.setTimeout(
      this.reconcileDroppedDrafts,
      DRAFT_SYNC_RECONCILE_DELAY
    );
  }

  private reconcileDroppedDrafts = () => {
    this.draftSyncReconcileTimeout = undefined;
    if(!this.draftSyncReconcileKeys.size) return;

    // * a save still under way would leave out what the read brings of its draft: it is waited out
    if([...this.draftSyncReconcileKeys.keys()].some((key) => this.draftSaves.get(key)?.pending)) {
      this.draftSyncReconcileTimeout = ctx.setTimeout(
        this.reconcileDroppedDrafts,
        DRAFT_SYNC_RECONCILE_DELAY
      );
      return;
    }

    const targets = new Map(this.draftSyncReconcileKeys);
    this.draftSyncReconcileKeys.clear();
    this.requestAllDrafts(targets).catch(noop);
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

  /** `asked`: the drafts asked for again (`reconcileDroppedDrafts`), which the read says are gone by leaving them out */
  private requestAllDrafts(asked?: Map<string, ClearDraftArgs>) {
    const askedAt = this.draftsClock;
    return this.apiManager.invokeApi('messages.getAllDrafts')
    .then((updates) => {
      const held = new Set<string>();
      // * what it brings is measured against the changes of each draft after it was asked for (`skipCloudDraft`)
      (updates as Updates.updates).updates?.forEach((update) => {
        if(update._ !== 'updateDraftMessage') return;
        this.draftReads.set(update, askedAt);
        const {peerId, threadId, monoforumThreadId} = this.getUpdateDraftTarget(update);
        held.add(this.getKey(peerId, monoforumThreadId || threadId));
      });
      const p = this.apiUpdatesManager.updatesState.syncLoading || Promise.resolve();
      return p.then(() => {
        this.apiUpdatesManager.processUpdateMessage(updates);

        // * it holds every draft there is: one asked for again that it leaves out was cleared (another session sent
        // * it, or emptied it), as a clear pushed then would say
        asked?.forEach((target, key) => {
          // * a draft whose save failed is here only: the server not having it says nothing of it, and it is saved again
          if(held.has(key) || !this.drafts[key] || this.draftSyncStates.get(key)?.status === 'failed') return;
          const draft: DraftMessage.draftMessageEmpty = {_: 'draftMessageEmpty'};
          if(this.skipCloudDraft(key, draft, askedAt)) {
            this.scheduleDraftSyncReconcile(key, target);
            return;
          }

          this.saveDraft({...target, draft, notify: true, askedAt});
        });
      });
    });
  }

  private getAllDrafts() {
    return this.getAllDraftPromise ??= forgetFailedRequest(this.requestAllDrafts(), () => this.getAllDraftPromise, () => this.getAllDraftPromise = undefined);
  }

  public saveDraft({
    peerId,
    threadId,
    monoforumThreadId,
    draft: apiDraft,
    notify,
    force,
    cloud,
    askedAt
  }: {
    peerId: PeerId,
    threadId?: number,
    monoforumThreadId?: PeerId,
    draft: DraftMessage,
    notify?: boolean,
    force?: boolean,
    /** the server's, as a dialog brings it: left out when older than what this session has (`skipCloudDraft`) */
    cloud?: boolean,
    /** the drafts clock's tick the read that brought it was asked for at (`getDraftsClock`) */
    askedAt?: number
  }) {
    const key = this.getKey(peerId, monoforumThreadId || threadId);
    if(cloud && this.skipCloudDraft(key, apiDraft, askedAt)) {
      // * one of another session's may have come with it
      if(apiDraft?._ === 'draftMessage' || this.drafts[key]) {
        this.scheduleDraftSyncReconcile(key, {peerId, threadId, monoforumThreadId});
      }

      return this.drafts[key];
    }

    const draft = this.processApiDraft(apiDraft, peerId, this.getReferenceContext(peerId, monoforumThreadId || threadId));
    // * a change here, a draft pushed or this session's own: a read asked for before it predates it (`skipCloudDraft`).
    // * Of two reads, neither is known to be the newer
    if(askedAt === undefined && (draft || this.drafts[key])) this.getDraftSaves(key).changed = ++this.draftsClock;
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

  private processApiDraft(draft: DraftMessage, peerId: PeerId, context: ReferenceContext): MyDraftMessage {
    if(draft?._ !== 'draftMessage') {
      return undefined;
    }

    this.saveRichMessageMedia(draft, context);

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

  private saveRichMessageMedia(draft: DraftMessage, context: ReferenceContext) {
    if(draft?._ === 'draftMessage' && draft.rich_message) {
      draft.rich_message.documents = (draft.rich_message.documents || [])
      .map((document) => this.appDocsManager.saveDoc(document, context))
      .filter(Boolean);
      draft.rich_message.photos = (draft.rich_message.photos || [])
      .map((photo) => this.appPhotosManager.savePhoto(photo, context))
      .filter(Boolean);
    }
  }

  /**
   * A draft lives long, and comes back from storage after a reload, so the file references of its
   * media expire. The drafts fetched anew renew them in place; the drafts themselves are left as
   * they are, since applying them again would redraw a composer whose media is loading right then.
   */
  public refreshRichMessageMedia() {
    return this.apiManager.invokeApiSingleProcess({
      method: 'messages.getAllDrafts',
      processResult: (updates) => {
        if(updates._ !== 'updates' && updates._ !== 'updatesCombined') return;
        this.appPeersManager.saveApiPeers(updates);
        for(const update of updates.updates) {
          if(update._ !== 'updateDraftMessage') continue;
          const {peerId, threadId, monoforumThreadId} = this.getUpdateDraftTarget(update);
          this.saveRichMessageMedia(update.draft, this.getReferenceContext(peerId, monoforumThreadId || threadId));
        }
      }
    });
  }

  public syncDraft({peerId, threadId, monoforumThreadId, localDraft, inputRichMessage, saveOnServer = true, force = false}: SyncDraftArgs) {
    // console.warn(dT(), 'sync draft', peerID)
    const key = this.getKey(peerId, monoforumThreadId || threadId);
    const serverDraft = this.drafts[key];
    const syncState = this.draftSyncStates.get(key);
    if(
      draftsAreEqual(serverDraft, localDraft) &&
      (!saveOnServer || syncState?.status !== 'failed')
    ) {
      // console.warn(dT(), 'equal drafts', localDraft, serverDraft)
      // * the same draft on its way to the server: it is the server's once that save goes through
      return (saveOnServer && syncState?.saved) || true;
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
          poll_option: replyTo.poll_option,
          // * the quote stays with the draft, as tdesktop's ReplyToForMTP and iOS' apiReplyQuoteFields send it
          quote_text: replyTo.quote_text,
          quote_entities: replyTo.quote_entities,
          quote_offset: replyTo.quote_offset,
          quote_rich: replyTo.quote_rich
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

      // * the message effect chosen goes with the draft too: left out, the server's copy came back without it
      if(localDraft.effect) {
        params.effect = localDraft.effect;
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
      const previousSync = this.draftSyncStates.get(key);
      const queue = previousSync?.queue || createSerializedQueue();
      const saves = this.startDraftSave(key);
      let holds = true;
      const endSave = () => {
        if(!holds) return;
        holds = false;
        this.endDraftSave(saves);
      };
      const pendingState: DraftSyncState = {id: syncId, status: 'pending', queue, release: endSave};
      previousSync?.release?.();
      this.draftSyncStates.set(key, pendingState);

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
          // * its request goes: the hold lasts while it does, whatever comes meanwhile - between its tries (a file
          // * reference refreshed) a newer save or a clear lets go of it again
          pendingState.release = undefined;
          const request = this.apiManager.invokeApi('messages.saveDraft', params);
          // * a try ended: a save a newer one took the place of meanwhile lets go at once, any other may be let go of again
          const tryEnded = () => {
            if(this.draftSyncStates.get(key)?.id !== syncId) endSave();
            else pendingState.release = endSave;
          };
          request.then(tryEnded, tryEnded);
          return request;
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

      // * whether this draft is the server's now: a newer one of the draft may have gone instead
      const saved = promise.then((result) => {
        endSave();
        if(this.draftSyncStates.get(key)?.id === syncId) {
          this.draftSyncStates.delete(key);
        }

        return result === true;
      }, (error) => {
        endSave();
        if(this.draftSyncStates.get(key)?.id === syncId) {
          this.draftSyncStates.set(key, {id: syncId, status: 'failed', queue});
        }

        throw error;
      });
      pendingState.saved = saved;

      const dialog = this.dialogsStorage.getDialogOnly(peerId); // * create or delete dialog when draft changes
      if(!dialog || !getServerMessageId(dialog.top_message)) {
        return saved.then((isSaved) => {
          return this.appMessagesManager.reloadConversation(peerId).then(() => isSaved);
        });
      }

      return saved;
    }

    this.cancelDraftSync(key);
    return true;
  }

  /**
   * Local clearing after send cancels preparation, but retains the queue until
   * any already dispatched write settles so a new draft cannot overtake it. A
   * save still waiting there would reach the server after the send's
   * `clear_draft` and bring the draft back.
   */
  private cancelDraftSync(key: string) {
    const previousSync = this.draftSyncStates.get(key);
    if(previousSync) {
      previousSync.release?.();
      const id = ++this.draftSyncId;
      const {queue} = previousSync;
      this.draftSyncStates.set(key, {id, status: 'pending', queue});
      void queue.enqueue(() => {
        if(this.draftSyncStates.get(key)?.id !== id) return;
        this.draftSyncStates.delete(key);
      });
    }
  }

  public clearAllDrafts() {
    // * a draft saved while the request is on its way (another tab, a field still typed in) is newer than the clear
    const cleared = {...this.drafts};
    return this.apiManager.invokeApi('messages.clearAllDrafts').then((bool) => {
      if(!bool) {
        return;
      }

      // * the server tells this session nothing: what it keeps goes as well, as Android does after the answer
      for(const key in cleared) {
        if(this.drafts[key] !== cleared[key]) continue;
        const [strPeerId, strThreadId] = key.split('_');
        const peerId = strPeerId.toPeerId();
        // * a monoforum's draft is kept under the thread's peer, a forum's under the topic
        const isMonoforum = !!strThreadId && this.appPeersManager.isMonoforum(peerId);
        this.dropDraft({
          peerId,
          threadId: strThreadId && !isMonoforum ? +strThreadId : undefined,
          monoforumThreadId: isMonoforum ? strThreadId.toPeerId() : undefined
        });
      }
    });
  }

  public clearDraft({peerId, threadId, monoforumThreadId}: ClearDraftArgs) {
    if(threadId) {
      const emptyDraft: DraftMessage.draftMessageEmpty = {_: 'draftMessageEmpty'};
      this.syncDraft({peerId, threadId, monoforumThreadId, localDraft: emptyDraft as any, saveOnServer: false, force: true});
    } else {
      this.dropDraft({peerId, monoforumThreadId, force: true});
    }
  }

  /** drops a draft kept here, tells whoever shows it, and lets no save still on its way bring it back */
  private dropDraft({peerId, threadId, monoforumThreadId, force}: ClearDraftArgs & {force?: boolean}) {
    this.saveDraft({
      peerId,
      threadId,
      monoforumThreadId,
      draft: {_: 'draftMessageEmpty'},
      notify: true,
      force
    });
    this.cancelDraftSync(this.getKey(peerId, monoforumThreadId || threadId));
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
