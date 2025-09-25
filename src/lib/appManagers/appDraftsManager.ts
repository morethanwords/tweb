/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import {MessageEntity, DraftMessage, MessagesSaveDraft, MessageReplyHeader, InputReplyTo, MessageMedia, WebPage, InputMedia} from '../../layer';
import tsNow from '../../helpers/tsNow';
import assumeType from '../../helpers/assumeType';
import {AppManager} from './manager';
import getServerMessageId from './utils/messageId/getServerMessageId';
import draftsAreEqual from './utils/drafts/draftsAreEqual';
import isObject from '../../helpers/object/isObject';
import getPeerId from './utils/peers/getPeerId';

export type MyDraftMessage = DraftMessage.draftMessage;

type SyncDraftArgs = {
  peerId: PeerId;
  threadId?: number;
  monoforumThreadId?: PeerId;
  localDraft?: DraftMessage;
  saveOnServer?: boolean;
  force?: boolean;
};

type ClearDraftArgs = {
  peerId: PeerId;
  threadId?: number;
  monoforumThreadId?: PeerId;
};

export class AppDraftsManager extends AppManager {
  private drafts: { [peerIdAndThreadId: string]: MyDraftMessage };
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

        this.saveDraft({
          peerId,
          threadId,
          monoforumThreadId,
          draft,
          notify: true
        });
      }
    });

    /* return  */this.appStateManager.storage.get('drafts').then((drafts) => {
      this.drafts = drafts || {};
    });
  }

  public clear = (init?: boolean) => {
    if(!init) {
      this.getAllDraftPromise = undefined;
      this.getAllDraftsResolved = false;
    }

    this.drafts = {};
  };

  private getKey(peerId: PeerId, threadId?: number) {
    return '' + peerId + (threadId ? '_' + threadId : '');
  }

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

  private getAllDrafts() {
    return this.getAllDraftPromise ??= this.apiManager.invokeApi('messages.getAllDrafts')
    .then((updates) => {
      const p = this.apiUpdatesManager.updatesState.syncLoading || Promise.resolve();
      return p.then(() => {
        this.apiUpdatesManager.processUpdateMessage(updates);
      });
    });
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

    if(!draft.message.length) {
      return true;
    }

    return false;
  }

  private processApiDraft(draft: DraftMessage, peerId: PeerId): MyDraftMessage {
    if(draft?._ !== 'draftMessage') {
      return undefined;
    }

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

  public syncDraft({peerId, threadId, monoforumThreadId, localDraft, saveOnServer = true, force = false}: SyncDraftArgs) {
    // console.warn(dT(), 'sync draft', peerID)
    const serverDraft = this.getDraft(peerId, monoforumThreadId || threadId);
    if(draftsAreEqual(serverDraft, localDraft)) {
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
      if(replyTo) {
        params.reply_to = {
          _: 'inputReplyToMessage',
          reply_to_msg_id: getServerMessageId(replyTo.reply_to_msg_id)
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
    saveLocalDraft.date = tsNow(true) + this.timeManager.getServerTimeOffset();

    this.saveDraft({
      peerId,
      threadId,
      monoforumThreadId,
      draft: saveLocalDraft,
      notify: true,
      force
    });

    if(saveOnServer) {
      const promise = this.apiManager.invokeApi('messages.saveDraft', params);
      const dialog = this.dialogsStorage.getDialogOnly(peerId); // * create or delete dialog when draft changes
      if(!dialog || !getServerMessageId(dialog.top_message)) {
        return promise.then(() => {
          return this.appMessagesManager.reloadConversation(peerId);
        });
      }

      return promise;
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
