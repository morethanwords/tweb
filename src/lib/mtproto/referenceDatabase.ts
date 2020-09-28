import { Photo } from "../../layer";
import { deepEqual } from "../utils";

export type ReferenceContext = ReferenceContext.referenceContextProfilePhoto | ReferenceContext.referenceContextMessage;
export namespace ReferenceContext {
  export type referenceContextProfilePhoto = {
    type: 'profilePhoto',
    peerID: number
  };

  export type referenceContextMessage = {
    type: 'message',
    messageID: number
  };
}

export type ReferenceBytes = Photo.photo['file_reference'];
//type ReferenceBytes = Uint8Array;

class ReferenceDatabase {
  private contexts: Map<ReferenceBytes, Set<ReferenceContext>> = new Map();
  //private references: Map<ReferenceBytes, number[]> = new Map();

  public saveContext(reference: ReferenceBytes, context: ReferenceContext) {
    const contexts = this.contexts.get(reference) ?? new Set();

    for(const _context of contexts) {
      if(deepEqual(_context, context)) {
        return;
      }
    }

    contexts.add(context);
    this.contexts.set(reference, contexts);
  }

  public getContext(reference: ReferenceBytes): ReferenceContext {
    const contexts = this.contexts.get(reference);
    return contexts ? contexts.values().next().value : undefined;
  }

  public deleteContext(reference: ReferenceBytes, context: ReferenceContext) {
    const contexts = this.contexts.get(reference);
    if(contexts) {
      for(const _context of contexts) {
        if(deepEqual(_context, context)) {
          contexts.delete(_context);
          if(!contexts.size) {
            this.contexts.delete(reference);
          }
          return true;
        }
      }
    }

    return false;
  }

  /* public replaceReference(oldReference: ReferenceBytes, newReference: ReferenceBytes) {
    const contexts = this.contexts.get(oldReference);
    if(contexts) {
      this.contexts.delete(oldReference);
      this.contexts.set(newReference, contexts);
    }
  } */
}

const referenceDatabase = new ReferenceDatabase();
if(process.env.NODE_ENV != 'production') {
  (window as any).referenceDatabase = referenceDatabase;
}
export default referenceDatabase;