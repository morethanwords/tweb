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

import {MessageEntity, DraftMessage, MessagesSaveDraft} from '../../layer';
import tsNow from '../../helpers/tsNow';
import stateStorage from '../stateStorage';
import assumeType from '../../helpers/assumeType';
import {AppManager} from './manager';
import getServerMessageId from './utils/messageId/getServerMessageId';
import draftsAreEqual from './utils/drafts/draftsAreEqual';

export type MyDraftMessage = DraftMessage.draftMessage;

export class AppDraftsManager extends AppManager {
  private drafts: {[peerIdAndThreadId: string]: MyDraftMessage} = {};
  private getAllDraftPromise: Promise<void>;

  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updateDraftMessage: (update) => {
        const peerId = this.appPeersManager.getPeerId(update.peer);
        this.saveDraft({
          peerId,
          threadId: update.threadId,
          draft: update.draft,
          notify: true
        });
      }
    });

    /* return  */stateStorage.get('drafts').then((drafts) => {
      this.drafts = drafts || {};
    });
  }

  private getKey(peerId: PeerId, threadId?: number) {
    return '' + peerId + (threadId ? '_' + threadId : '');
  }

  public getDraft(peerId: PeerId, threadId?: number) {
    return this.drafts[this.getKey(peerId, threadId)];
  }

  public addMissedDialogs() {
    return this.getAllDrafts().then(() => {
      for(const key in this.drafts) {
        if(key.indexOf('_') !== -1) { // exclude threads
          continue;
        }

        const peerId = key.toPeerId();
        const dialog = this.appMessagesManager.getDialogOnly(peerId);
        if(!dialog) {
          this.appMessagesManager.reloadConversation(peerId);
          /* const dialog = appMessagesManager.generateDialog(peerId);
          dialog.draft = this.drafts[key];
          appMessagesManager.saveConversation(dialog);
          appMessagesManager.newDialogsToHandle[peerId] = dialog;
          appMessagesManager.scheduleHandleNewDialogs(); */
        }
      }
    });
  }

  private getAllDrafts() {
    return this.getAllDraftPromise ??= this.apiManager.invokeApi('messages.getAllDrafts')
    .then((updates) => {
      const p = this.apiUpdatesManager.updatesState.syncLoading || Promise.resolve();
      p.then(() => {
        this.apiUpdatesManager.processUpdateMessage(updates);
      });
    });
  }

  public saveDraft({
    peerId,
    threadId,
    draft: apiDraft,
    notify,
    force
  }: {
    peerId: PeerId,
    threadId?: number,
    draft: DraftMessage,
    notify?: boolean,
    force?: boolean
  }) {
    const draft = this.processApiDraft(apiDraft, peerId);

    const key = this.getKey(peerId, threadId);
    if(draft) {
      this.drafts[key] = draft;
    } else {
      delete this.drafts[key];
    }

    stateStorage.set({
      drafts: this.drafts
    });

    if(notify) {
      // console.warn(dT(), 'save draft', peerId, apiDraft, options)
      this.rootScope.dispatchEvent('draft_updated', {
        peerId,
        threadId,
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

    if(draft.reply_to_msg_id !== undefined && draft.reply_to_msg_id > 0) {
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

    if(draft.reply_to_msg_id) {
      const channelId = this.appPeersManager.isChannel(peerId) ? peerId.toChatId() : undefined;
      draft.reply_to_msg_id = this.appMessagesIdsManager.generateMessageId(draft.reply_to_msg_id, channelId);
    }

    return draft;
  }

  public syncDraft(peerId: PeerId, threadId: number, localDraft?: DraftMessage, saveOnServer = true, force = false) {
    // console.warn(dT(), 'sync draft', peerID)
    const serverDraft = this.getDraft(peerId, threadId);
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
    } else {
      assumeType<DraftMessage.draftMessage>(localDraft);
      const message = localDraft.message;
      const entities: MessageEntity[] = localDraft.entities;

      if(localDraft.reply_to_msg_id) {
        params.reply_to_msg_id = getServerMessageId(localDraft.reply_to_msg_id);
      }

      if(entities?.length) {
        params.entities = this.appMessagesManager.getInputEntities(entities);
      }

      if(localDraft.pFlags.no_webpage) {
        params.no_webpage = localDraft.pFlags.no_webpage;
      }

      params.message = message;
    }

    if(threadId) {
      params.top_msg_id = getServerMessageId(threadId);
    }

    const saveLocalDraft = draftObj || localDraft;
    saveLocalDraft.date = tsNow(true) + this.timeManager.getServerTimeOffset();

    this.saveDraft({
      peerId,
      threadId,
      draft: saveLocalDraft,
      notify: true,
      force
    });

    if(saveOnServer) {
      return this.apiManager.invokeApi('messages.saveDraft', params);
    }

    return true;
  }

  public clearAllDrafts() {
    return this.apiManager.invokeApi('messages.clearAllDrafts').then((bool) => {
      if(!bool) {
        return;
      }

      for(const combined in this.drafts) {
        const [peerId, threadId] = combined.split('_');
        this.rootScope.dispatchEvent('draft_updated', {
          peerId: peerId.toPeerId(),
          threadId: threadId ? +threadId : undefined,
          draft: undefined
        });
      }
    });
  }

  public clearDraft(peerId: PeerId, threadId: number) {
    const emptyDraft: DraftMessage.draftMessageEmpty = {
      _: 'draftMessageEmpty'
    };

    if(threadId) {
      this.syncDraft(peerId, threadId, emptyDraft as any, false, true);
    } else {
      this.saveDraft({
        peerId,
        threadId,
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
      this.syncDraft(peerId, threadId, draft, false, true);
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
