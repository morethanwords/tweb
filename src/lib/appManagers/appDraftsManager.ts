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

import { MessageEntity, DraftMessage, MessagesSaveDraft } from "../../layer";
import tsNow from "../../helpers/tsNow";
import stateStorage from "../stateStorage";
import assumeType from "../../helpers/assumeType";
import isObject from "../../helpers/object/isObject";
import deepEqual from "../../helpers/object/deepEqual";
import { AppManager } from "./manager";
import getPeerId from "./utils/peers/getPeerId";
import generateMessageId from "./utils/messageId/generateMessageId";
import getServerMessageId from "./utils/messageId/getServerMessageId";

export type MyDraftMessage = DraftMessage.draftMessage;

export class AppDraftsManager extends AppManager {
  private drafts: {[peerIdAndThreadId: string]: MyDraftMessage} = {};
  private getAllDraftPromise: Promise<void> = null;

  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updateDraftMessage: (update) => {
        const peerId = getPeerId(update.peer);
        this.saveDraft(peerId, update.threadId, update.draft, {notify: true});
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

  public getAllDrafts() {
    return this.getAllDraftPromise || (
      this.getAllDraftPromise = this.apiManager.invokeApi('messages.getAllDrafts')
      .then((updates) => {
        const p = this.apiUpdatesManager.updatesState.syncLoading || Promise.resolve();
        p.then(() => {
          this.apiUpdatesManager.processUpdateMessage(updates);
        });
      })
    );
  }

  public saveDraft(peerId: PeerId, threadId: number, apiDraft: DraftMessage, options: Partial<{
    notify: boolean,
    force: boolean
  }> = {}) {
    const draft = this.processApiDraft(apiDraft);

    const key = this.getKey(peerId, threadId);
    if(draft) {
      this.drafts[key] = draft;
    } else {
      delete this.drafts[key];
    }

    stateStorage.set({
      drafts: this.drafts
    });

    if(options.notify) {
      // console.warn(dT(), 'save draft', peerId, apiDraft, options)
      this.rootScope.dispatchEvent('draft_updated', {
        peerId,
        threadId,
        draft,
        force: options.force
      });
    }

    return draft;
  }

  private draftsAreEqual(draft1: DraftMessage, draft2: DraftMessage) {
    if(typeof(draft1) !== typeof(draft2)) {
      return false;
    }

    if(!isObject(draft1)) {
      return true;
    }

    if(draft1._ !== draft2._) {
      return false;
    }
  
    if(draft1._ === 'draftMessage' && draft2._ === draft1._) {
      if(draft1.reply_to_msg_id !== draft2.reply_to_msg_id) {
        return false;
      }
  
      if(!deepEqual(draft1.entities, draft2.entities)) {
        return false;
      }
  
      if(draft1.message !== draft2.message) {
        return false;
      }
  
      if(draft1.pFlags.no_webpage !== draft2.pFlags.no_webpage) {
        return false;
      }
    }

    return true;
  }

  private isEmptyDraft(draft: DraftMessage) {
    if(!draft || draft._ === 'draftMessageEmpty') {
      return true;
    }
    
    if(draft.reply_to_msg_id > 0) {
      return false;
    }
    
    if(!draft.message.length) {
      return true;
    }
    
    return false;
  }

  private processApiDraft(draft: DraftMessage): MyDraftMessage {
    if(!draft || draft._ !== 'draftMessage') {
      return undefined;
    }

    if(draft.reply_to_msg_id) {
      draft.reply_to_msg_id = generateMessageId(draft.reply_to_msg_id);
    }

    return draft;
  }

  public async syncDraft(peerId: PeerId, threadId: number, localDraft?: DraftMessage, saveOnServer = true, force = false) {
    // console.warn(dT(), 'sync draft', peerID)
    const serverDraft = this.getDraft(peerId, threadId);
    if(this.draftsAreEqual(serverDraft, localDraft)) {
      // console.warn(dT(), 'equal drafts', localDraft, serverDraft)
      return true;
    }

    // console.warn(dT(), 'changed draft', localDraft, serverDraft)
    let params: MessagesSaveDraft = {
      peer: this.appPeersManager.getInputPeerById(peerId),
      message: ''
    };

    let draftObj: DraftMessage;
    if(this.isEmptyDraft(localDraft)) {
      draftObj = {_: 'draftMessageEmpty'};
    } else {
      assumeType<DraftMessage.draftMessage>(localDraft);
      let message = localDraft.message;
      let entities: MessageEntity[] = localDraft.entities;

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

    const saveLocalDraft = draftObj || localDraft;
    saveLocalDraft.date = tsNow(true) + this.timeManager.getServerTimeOffset();

    this.saveDraft(peerId, threadId, saveLocalDraft, {notify: true, force});

    if(saveOnServer && !threadId) {
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
      this.saveDraft(peerId, threadId, emptyDraft, {notify: true, force: true});  
    }
  }

  public setDraft(peerId: PeerId, threadId: number, message: string, entities?: MessageEntity[]) {
    const draft: DraftMessage.draftMessage = {
      _: 'draftMessage',
      date: Date.now() / 1000 | 0,
      message,
      pFlags: {},
      entities
    };

    if(threadId) {
      this.syncDraft(peerId, threadId, draft, false, true);
    } else {
      this.saveDraft(peerId, threadId, draft, {notify: true, force: true});  
    }
  }
}
