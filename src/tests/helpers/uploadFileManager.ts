import {vi} from 'vitest';
import {ApiFileManager} from '@appManagers/apiFileManager';

/** An ApiFileManager with what an upload needs and no constructor run; the server takes every part */
export default function makeUploadFileManager() {
  const dispatchEvent = vi.fn();
  const manager = Object.create(ApiFileManager.prototype) as ApiFileManager;
  Object.assign(manager as any, {
    log: Object.assign(() => {}, {error: vi.fn(), warn: vi.fn()}),
    tempId: 0,
    uploadPromises: {},
    downloadPulls: {},
    downloadActives: {},
    maxUploadParts: 4000,
    rootScope: {dispatchEvent, premium: false},
    apiManager: {invokeApi: vi.fn(() => Promise.resolve(true))}
  });

  return {manager, dispatchEvent};
}
