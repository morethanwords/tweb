import {ApiFileManager} from '@appManagers/apiFileManager';
import makeError from '@helpers/makeError';
import type {ReferenceBytes} from '@lib/storages/references';

/**
 * An ApiFileManager with what a request carrying a file reference needs (invokeApiWithReference) and no constructor
 * run: `refreshReference` stands for the references storage's refresh, which by default finds nothing to refresh by
 */
export default function makeReferenceRequestFileManager(
  refreshReference: (reference: ReferenceBytes) => Promise<ReferenceBytes> = () => Promise.reject(makeError('NO_CONTEXT'))
) {
  const manager = Object.create(ApiFileManager.prototype) as ApiFileManager;
  Object.assign(manager as any, {
    requestFilePartReferences: new Map(),
    referenceRequestKeys: new Map(),
    refreshReferencePromises: new Map(),
    referencesStorage: {refreshReference}
  });

  return manager;
}
