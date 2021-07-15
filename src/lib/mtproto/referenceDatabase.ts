/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { RefreshReferenceTask, RefreshReferenceTaskResponse } from "./apiFileManager";
import appMessagesManager from "../appManagers/appMessagesManager";
import { Photo } from "../../layer";
import { bytesToHex } from "../../helpers/bytes";
import { deepEqual } from "../../helpers/object";
import { MOUNT_CLASS_TO } from "../../config/debug";
import apiManager from "./mtprotoworker";
import assumeType from "../../helpers/assumeType";

export type ReferenceContext = ReferenceContext.referenceContextProfilePhoto | ReferenceContext.referenceContextMessage;
export namespace ReferenceContext {
  export type referenceContextProfilePhoto = {
    type: 'profilePhoto',
    peerId: number
  };

  export type referenceContextMessage = {
    type: 'message',
    peerId: number,
    messageId: number
  };
}

export type ReferenceBytes = Photo.photo['file_reference'];
export type ReferenceContexts = Set<ReferenceContext>;

//type ReferenceBytes = Uint8Array;

class ReferenceDatabase {
  private contexts: Map<ReferenceBytes, ReferenceContexts> = new Map();
  //private references: Map<ReferenceBytes, number[]> = new Map();
  private links: {[hex: string]: ReferenceBytes} = {};

  constructor() {
    apiManager.addTaskListener('refreshReference', (task: RefreshReferenceTask) => {
      const bytes = task.payload;

      assumeType<RefreshReferenceTaskResponse>(task);
      task.originalPayload = bytes;

      this.refreshReference(bytes).then(() => {
        task.payload = this.getReferenceByLink(bytes);
        apiManager.postMessage(task);
      }, (err) => {
        task.error = err;
        apiManager.postMessage(task);
      });
    });
  }

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
            delete this.links[bytesToHex(reference)];
          }
          return true;
        }
      }
    }

    return false;
  }

  public refreshReference(reference: ReferenceBytes, context?: ReferenceContext): Promise<void> {
    if(!context) {
      const c = this.getContext(reference);
      if(!c) {
        return Promise.reject('NO_CONTEXT');
      }

      [context, reference] = c;
    }

    let promise: Promise<any>;
    switch(context?.type) {
      case 'message': {
        promise = appMessagesManager.wrapSingleMessage(context.peerId, context.messageId, true);
        break; 
        // .then(() => {
        //   console.log('FILE_REFERENCE_EXPIRED: got message', context, appMessagesManager.getMessage((context as ReferenceContext.referenceContextMessage).messageId).media, reference);
        // });
      }

      default: {
        console.warn('FILE_REFERENCE_EXPIRED: not implemented context', context);
        return Promise.reject();
      }
    }

    const hex = bytesToHex(reference);
    return promise.then(() => {
      const newHex = bytesToHex(reference);
      if(hex !== newHex) {
        return;
      }

      this.deleteContext(reference, context);

      const newContext = this.getContext(reference);
      if(newContext) {
        return this.refreshReference(reference, newContext[0]);
      }

      throw 'NO_NEW_CONTEXT';
    });
  }

  /* handleReferenceError = (reference: ReferenceBytes, error: ApiError) => {
    switch(error.type) {
      case 'FILE_REFERENCE_EXPIRED': {
        return this.refreshReference(reference);
      }

      default:
        return Promise.reject(error);
    }
  }; */

  /* public replaceReference(oldReference: ReferenceBytes, newReference: ReferenceBytes) {
    const contexts = this.contexts.get(oldReference);
    if(contexts) {
      this.contexts.delete(oldReference);
      this.contexts.set(newReference, contexts);
    }
  } */
}

const referenceDatabase = new ReferenceDatabase();
MOUNT_CLASS_TO.referenceDatabase = referenceDatabase;
export default referenceDatabase;