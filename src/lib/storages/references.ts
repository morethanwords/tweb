/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Photo, StoryItem, WallPaper} from '@layer';
import bytesToHex from '@helpers/bytes/bytesToHex';
import deepEqual from '@helpers/object/deepEqual';
import {AppManager} from '@appManagers/manager';
import makeError from '@helpers/makeError';
import type {MyStickerSetInput} from '@lib/appManagers/utils/stickers/constants';

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
  ReferenceContext.referenceContextSavedGifs |
  ReferenceContext.referenceContextRecentStickers |
  ReferenceContext.referenceContextFavedStickers |
  ReferenceContext.referenceContextStickerSet |
  ReferenceContext.referenceContextAvailableEffects |
  ReferenceContext.referenceContextStickerSearch;

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

  export type referenceContextRecentStickers = {
    type: 'recentStickers'
  };

  export type referenceContextFavedStickers = {
    type: 'favedStickers'
  };

  export type referenceContextStickerSet = {
    type: 'stickerSet',
    input: MyStickerSetInput
  };

  export type referenceContextAvailableEffects = {
    type: 'availableEffects'
  };

  export type referenceContextStickerSearch = {
    type: 'stickerSearch',
    emoticon: string
  };
}

export type ReferenceBytes = Photo.photo['file_reference'];
export type ReferenceContexts = Set<ReferenceContext>;

// type ReferenceBytes = Uint8Array;

export class ReferencesStorage extends AppManager {
  private contexts: Map<ReferenceBytes, ReferenceContexts> = new Map();
  // private references: Map<ReferenceBytes, number[]> = new Map();
  private links: {[hex: string]: ReferenceBytes} = {};
  private refreshEmojiesSoundsPromise: Promise<any>;

  constructor() {
    super();
    this.name = 'REFS';
    this.logIgnoreDebugReset = true;
  }

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
    // if(!context) {
    //   debugger;
    // }

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
    const contexts = this.contexts.get(reference) || (
      reference = this.getReferenceByLink(reference) || reference,
      this.contexts.get(reference)
    );
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

  private getRefreshPromise(context: ReferenceContext): any {
    switch(context?.type) {
      case 'message': {
        // const message = copy(this.appMessagesManager.getMessageByPeer(context.peerId, context.messageId));
        return this.appMessagesManager.reloadMessages(context.peerId, context.messageId, true);
        // .then((_message) => {
        //   this.log('FILE_REFERENCE_EXPIRED: got message', context, message, _message);
        // });
      }

      case 'emojiesSounds':
        return this.refreshEmojiesSoundsPromise || this.appStickersManager.getAnimatedEmojiSounds(true).then(() => {
          this.refreshEmojiesSoundsPromise = undefined;
        });

      case 'userFull':
        return this.appProfileManager.getProfile(context.userId, true);

      case 'customEmoji':
        return this.appEmojiManager.getCustomEmojiDocuments([context.docId]);

      case 'attachMenuBotIcon':
        return this.appAttachMenuBotsManager.getAttachMenuBot(context.botId, true);

      case 'wallPaper':
        return this.appThemesManager.getWallPaperById(context.wallPaperId);

      case 'storyItem':
        return this.appStoriesManager.getStoryById(context.peerId, context.storyId, true);

      case 'premiumPromo':
        return this.appPaymentsManager.getPremiumPromo(true);

      case 'webPage':
        return this.appWebPagesManager.getWebPage(context.url);

      case 'botApp':
        return this.appAttachMenuBotsManager.getBotApp(context.botId, context.appName);

      case 'chatInvite':
        return this.appChatInvitesManager.checkChatInvite(context.hash);

      case 'effects':
        return this.appReactionsManager.getAvailableEffects(true);

      case 'savedGifs':
        return this.appGifsManager.getGifs(true);

      case 'recentStickers':
        return this.appStickersManager.getRecentStickers(true);

      case 'favedStickers':
        return this.appStickersManager.getFavedStickers(true);

      case 'stickerSet':
        return this.appStickersManager.getStickerSet(context.input, {overwrite: true});

      case 'availableEffects':
        return this.appReactionsManager.getAvailableEffects(true);

      case 'stickerSearch':
        return this.appStickersManager.getStickersByEmoticon({
          emoticon: context.emoticon,
          includeServerStickers: true,
          includeOurStickers: false
        });

      default: {
        this.log.warn('not implemented context', context);
        throw makeError('NO_CONTEXT');
      }
    }
  }

  public refreshReference(reference: ReferenceBytes, context?: ReferenceContext): Promise<Uint8Array | number[]> {
    const log = this.log.bindPrefix('refreshReference');
    log('start', reference.slice(), context);
    if(!context) {
      const c = this.getContext(reference);
      if(!c) {
        log('got no context for reference', reference.slice());
        return Promise.reject(makeError('NO_CONTEXT'));
      }

      [context, reference] = c;
    }

    const hex = bytesToHex(reference);
    let promise: Promise<any>;
    try {
      promise = this.getRefreshPromise(context);
      if(!(promise instanceof Promise)) {
        promise = Promise.resolve(promise);
      }
    } catch(err) {
      promise = Promise.reject(err);
    }

    log('refreshing reference', hex);

    const onFinish = () => {
      const newHex = bytesToHex(reference);
      log('refreshed, reference before', hex, 'after', newHex);
      if(hex !== newHex) {
        return reference;
      }

      this.deleteContext(reference, context);

      const newContext = this.getContext(reference);
      if(newContext) {
        return this.refreshReference(reference, newContext[0]);
      }

      log.error('no new context, reference before', hex, 'after', newHex, context);

      throw makeError('NO_NEW_CONTEXT');
    };

    return promise.then(onFinish, (err) => {
      log.error('error', err);
      return onFinish();
    });
  }

  /* public replaceReference(oldReference: ReferenceBytes, newReference: ReferenceBytes) {
    const contexts = this.contexts.get(oldReference);
    if(contexts) {
      this.contexts.delete(oldReference);
      this.contexts.set(newReference, contexts);
    }
  } */
}
