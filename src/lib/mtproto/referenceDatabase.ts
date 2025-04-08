/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Photo, StoryItem, WallPaper} from '../../layer';
import {logger} from '../logger';
import bytesToHex from '../../helpers/bytes/bytesToHex';
import deepEqual from '../../helpers/object/deepEqual';
import {AppManager} from '../appManagers/manager';
import makeError from '../../helpers/makeError';

export type ReferenceContext =
  ReferenceContext.referenceContextProfilePhoto |
  ReferenceContext.referenceContextMessage |
  ReferenceContext.referenceContextEmojiesSounds |
  ReferenceContext.referenceContextReactions |
  ReferenceContext.referenceContextUserFull |
  ReferenceContext.referenceContextCustomEmoji |
  ReferenceContext.referenceContextAttachMenuBotIcon |
  ReferenceContext.referenceContextWallPaper |
  ReferenceContext.referenceContextStoryItem |
  ReferenceContext.referenceContextPremiumPromo |
  ReferenceContext.referenceContextWebPage |
  ReferenceContext.referenceContextBotApp |
  ReferenceContext.referenceContextChatInvite |
  ReferenceContext.referenceContextEffects |
  ReferenceContext.referenceContextStarsTransaction |
  ReferenceContext.referenceContextSavedGifs;

export namespace ReferenceContext {
  export type referenceContextProfilePhoto = {
    type: 'profilePhoto',
    peerId: PeerId
  };

  export type referenceContextMessage = {
    type: 'message',
    peerId: PeerId,
    messageId: number
  };

  export type referenceContextEmojiesSounds = {
    type: 'emojiesSounds'
  };

  export type referenceContextReactions = {
    type: 'reactions'
  };

  export type referenceContextUserFull = {
    type: 'userFull',
    userId: UserId
  };

  export type referenceContextCustomEmoji = {
    type: 'customEmoji',
    docId: DocId
  };

  export type referenceContextAttachMenuBotIcon = {
    type: 'attachMenuBotIcon',
    botId: BotId
  };

  export type referenceContextWallPaper = {
    type: 'wallPaper',
    wallPaperId: WallPaper['id']
  };

  export type referenceContextStoryItem = {
    type: 'storyItem',
    peerId: PeerId,
    storyId: StoryItem['id'],
  };

  export type referenceContextPremiumPromo = {
    type: 'premiumPromo'
  };

  export type referenceContextWebPage = {
    type: 'webPage',
    url: string
  };

  export type referenceContextBotApp = {
    type: 'botApp',
    botId: BotId,
    appName: string
  };

  export type referenceContextChatInvite = {
    type: 'chatInvite',
    hash: string
  };

  export type referenceContextEffects = {
    type: 'effects'
  };

  export type referenceContextStarsTransaction = {
    type: 'starsTransaction',
    peerId: PeerId,
    mid: number
  };

  export type referenceContextSavedGifs = {
    type: 'savedGifs'
  };
}

export type ReferenceBytes = Photo.photo['file_reference'];
export type ReferenceContexts = Set<ReferenceContext>;

// type ReferenceBytes = Uint8Array;

export class ReferenceDatabase extends AppManager {
  private contexts: Map<ReferenceBytes, ReferenceContexts> = new Map();
  // private references: Map<ReferenceBytes, number[]> = new Map();
  private links: {[hex: string]: ReferenceBytes} = {};
  private log = logger('RD', undefined, true);
  private refreshEmojiesSoundsPromise: Promise<any>;

  // constructor() {
  //   super();

  // apiManager.addTaskListener('refreshReference', (task: RefreshReferenceTask) => {
  //   const originalPayload = task.payload;

  //   assumeType<RefreshReferenceTaskResponse>(task);
  //   task.originalPayload = originalPayload;

  //   this.refreshReference(originalPayload).then((bytes) => {
  //     task.payload = bytes;
  //   }, (err) => {
  //     task.error = err;
  //   }).then(() => apiManager.postMessage(task));
  // });
  // }

  public saveContext(reference: ReferenceBytes, context: ReferenceContext, contexts?: ReferenceContexts) {
    [contexts, reference] = this.getContexts(reference);
    if(!contexts) {
      contexts = new Set();
      this.contexts.set(reference, contexts);
    }

    this.links[bytesToHex(reference)] = reference;
    for(const _context of contexts) {
      if(deepEqual(_context, context)) {
        return;
      }
    }

    contexts.add(context);
  }

  public getReferenceByLink(reference: ReferenceBytes) {
    return this.links[bytesToHex(reference)];
  }

  public getContexts(reference: ReferenceBytes): [ReferenceContexts, ReferenceBytes] {
    const contexts = this.contexts.get(reference) || (reference = this.getReferenceByLink(reference) || reference, this.contexts.get(reference));
    return [contexts, reference];
  }

  public getContext(reference: ReferenceBytes): [ReferenceContext, ReferenceBytes] {
    const contexts = this.getContexts(reference);
    return contexts[0] ? [contexts[0].values().next().value, contexts[1]] : undefined;
  }

  public deleteContext(reference: ReferenceBytes, context: ReferenceContext, contexts?: ReferenceContexts) {
    [contexts, reference] = this.getContexts(reference);
    if(contexts) {
      for(const _context of contexts) {
        if(deepEqual(_context, context)) {
          contexts.delete(_context);
          if(!contexts.size) {
            this.contexts.delete(reference);
            this.apiFileManager.cancelDownloadByReference(reference);
            delete this.links[bytesToHex(reference)];
          }
          return true;
        }
      }
    }

    return false;
  }

  public refreshReference(reference: ReferenceBytes, context?: ReferenceContext): Promise<Uint8Array | number[]> {
    this.log('refreshReference: start', reference.slice(), context);
    if(!context) {
      const c = this.getContext(reference);
      if(!c) {
        this.log('refreshReference: got no context for reference:', reference.slice());
        return Promise.reject('NO_CONTEXT');
      }

      [context, reference] = c;
    }

    const hex = bytesToHex(reference);
    let promise: Promise<any>;
    switch(context?.type) {
      case 'message': {
        promise = this.appMessagesManager.reloadMessages(context.peerId, context.messageId, true);
        break;
        // .then(() => {
        //   console.log('FILE_REFERENCE_EXPIRED: got message', context, appMessagesManager.getMessage((context as ReferenceContext.referenceContextMessage).messageId).media, reference);
        // });
      }

      case 'emojiesSounds': {
        promise = this.refreshEmojiesSoundsPromise || this.appStickersManager.getAnimatedEmojiSounds(true).then(() => {
          this.refreshEmojiesSoundsPromise = undefined;
        });
        break;
      }

      case 'userFull': {
        promise = Promise.resolve(this.appProfileManager.getProfile(context.userId, true));
        break;
      }

      case 'customEmoji': {
        promise = this.appEmojiManager.getCustomEmojiDocuments([context.docId]);
        break;
      }

      case 'attachMenuBotIcon': {
        promise = this.appAttachMenuBotsManager.getAttachMenuBot(context.botId, true) as any;
        break;
      }

      case 'wallPaper': {
        promise = this.appThemesManager.getWallPaperById(context.wallPaperId);
        break;
      }

      case 'storyItem': {
        promise = Promise.resolve(this.appStoriesManager.getStoryById(context.peerId, context.storyId, true));
        break;
      }

      case 'premiumPromo': {
        promise = Promise.resolve(this.appPaymentsManager.getPremiumPromo(true));
        break;
      }

      case 'webPage': {
        promise = Promise.resolve(this.appWebPagesManager.getWebPage(context.url));
        break;
      }

      case 'botApp': {
        promise = Promise.resolve(this.appAttachMenuBotsManager.getBotApp(context.botId, context.appName));
        break;
      }

      case 'chatInvite': {
        promise = Promise.resolve(this.appChatInvitesManager.checkChatInvite(context.hash));
        break;
      }

      case 'effects': {
        promise = Promise.resolve(this.appReactionsManager.getAvailableEffects(true));
        break;
      }

      case 'savedGifs': {
        promise = Promise.resolve(this.appGifsManager.getGifs(true));
        break;
      }

      default: {
        this.log.warn('refreshReference: not implemented context', context);
        return Promise.reject();
      }
    }

    this.log('refreshReference: refreshing reference:', hex);

    const onFinish = () => {
      const newHex = bytesToHex(reference);
      this.log('refreshReference: refreshed, reference before:', hex, 'after:', newHex);
      if(hex !== newHex) {
        return reference;
      }

      this.deleteContext(reference, context);

      const newContext = this.getContext(reference);
      if(newContext) {
        return this.refreshReference(reference, newContext[0]);
      }

      this.log.error('refreshReference: no new context, reference before:', hex, 'after:', newHex, context);

      throw makeError('NO_NEW_CONTEXT');
    };

    return promise.then(onFinish, onFinish);
  }

  /* public replaceReference(oldReference: ReferenceBytes, newReference: ReferenceBytes) {
    const contexts = this.contexts.get(oldReference);
    if(contexts) {
      this.contexts.delete(oldReference);
      this.contexts.set(newReference, contexts);
    }
  } */
}
