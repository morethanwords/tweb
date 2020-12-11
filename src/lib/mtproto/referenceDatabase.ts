import appMessagesManager from "../appManagers/appMessagesManager";
import { Photo } from "../../layer";
import { MOUNT_CLASS_TO } from "./mtproto_config";
import { bytesToHex } from "../../helpers/bytes";
import { deepEqual } from "../../helpers/object";

export type ReferenceContext = ReferenceContext.referenceContextProfilePhoto | ReferenceContext.referenceContextMessage;
export namespace ReferenceContext {
  export type referenceContextProfilePhoto = {
    type: 'profilePhoto',
    peerId: number
  };

  export type referenceContextMessage = {
    type: 'message',
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

  public saveContext(reference: ReferenceBytes, context: ReferenceContext, contexts?: ReferenceContexts) {
    [contexts, reference] = this.getContexts(reference);
    if(!contexts) {
      contexts = new Set();
      this.contexts.set(reference, contexts);
      this.links[bytesToHex(reference)] = reference;
    }

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
    return contexts ? [contexts[0].values().next().value, contexts[1]] : undefined;
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
    [context, reference] = this.getContext(reference);
    switch(context?.type) {
      case 'message': {
        return appMessagesManager.wrapSingleMessage(context.messageId, true);
        // .then(() => {
        //   console.log('FILE_REFERENCE_EXPIRED: got message', context, appMessagesManager.getMessage((context as ReferenceContext.referenceContextMessage).messageId).media, reference);
        // });
      }

      default: {
        console.warn('FILE_REFERENCE_EXPIRED: not implemented context', context);
        return Promise.reject();
      }
    }
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
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.referenceDatabase = referenceDatabase);
export default referenceDatabase;