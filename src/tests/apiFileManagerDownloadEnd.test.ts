import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import makeError from '@helpers/makeError';
import noop from '@helpers/noop';
import pause from '@helpers/schedulers/pause';
import readBlobAsUint8Array from '@helpers/blob/readBlobAsUint8Array';
import {ApiFileManager, MyUploadFile} from '@appManagers/apiFileManager';
import MemoryWriter from '@lib/files/memoryWriter';

// the part size the downloads below ask for (the manager's own for any file below 512 MB)
const PART = 64 * 1024;

type PartRequest = {offset: number, limit: number, deferred: CancellablePromise<MyUploadFile>};

function fileBytes(size: number) {
  const bytes = new Uint8Array(size);
  for(let i = 0; i < size; ++i) {
    bytes[i] = (i * 7 + (i >> 16)) & 0xff;
  }

  return bytes;
}

// a download of a file of `actual` bytes that the client was told has `reported` bytes
async function startDownload(actual: number, reported = actual) {
  const file = fileBytes(actual);
  const requests: PartRequest[] = [];
  const manager = Object.create(ApiFileManager.prototype) as ApiFileManager;
  const log: any = Object.assign(noop, {error: noop, warn: noop, bindPrefix: () => log});
  Object.assign(manager as any, {
    log,
    tempId: 0,
    downloadPromises: {},
    rootScope: {dispatchEvent: noop},
    cacheStorage: {
      getFile: () => Promise.reject(makeError('NO_ENTRY_FOUND')),
      prepareWriting: (fileName: string, size: number, mimeType: string) => ({
        deferred: deferredPromise<Blob>(),
        getWriter: () => new MemoryWriter(mimeType, size)
      })
    },
    requestFilePart: ({offset, limit}: {offset: number, limit: number}) => {
      const deferred = deferredPromise<MyUploadFile>();
      requests.push({offset, limit, deferred});
      return deferred;
    }
  });

  const promise = manager.download({
    dcId: 2,
    location: {
      _: 'inputDocumentFileLocation',
      id: '1',
      access_hash: '2',
      file_reference: new Uint8Array([1, 2, 3]) as any,
      thumb_size: ''
    },
    size: reported,
    limitPart: PART,
    mimeType: 'application/octet-stream' as MTMimeType
  });
  await pause(0);

  // what the server answers: the bytes of [offset, offset + limit) that the file has - none past its end
  const answer = async(request: PartRequest) => {
    request.deferred.resolve({
      _: 'upload.file',
      type: {_: 'storage.fileUnknown'},
      mtime: 0,
      bytes: file.slice(request.offset, request.offset + request.limit)
    });
    await pause(0);
  };

  const result = async() => readBlobAsUint8Array(await promise);

  return {file, requests, answer, result};
}

describe('ApiFileManager.download: the end of a file', () => {
  it('asks for no part past the end of a file whose size is a whole number of parts', async() => {
    const size = 2 * PART;
    const {file, requests, answer, result} = await startDownload(size);

    for(let answered = 0; answered < requests.length; ++answered) {
      await answer(requests[answered]);
    }

    expect(await result()).toEqual(file);
    expect(requests.every(({offset}) => offset < size)).toBe(true);
  });

  it('gives the whole file when an empty part past its end comes back before the parts before it', async() => {
    const {file, requests, answer, result} = await startDownload(3 * PART, 4 * PART);
    expect(requests.map(({offset}) => offset)).toEqual([0, PART, 2 * PART, 3 * PART]);

    await answer(requests[0]);
    await answer(requests[3]); // empty: past the end
    await answer(requests[2]);
    await answer(requests[1]);

    expect(await result()).toEqual(file);
  });

  it('gives the whole file whatever order the parts of a whole number of parts come back in', async() => {
    const {file, requests, answer, result} = await startDownload(4 * PART);

    // the first part comes back first, the rest last to first, whatever more is asked for in between
    await answer(requests[0]);
    const pending = () => requests.filter(({deferred}) => !deferred.isFulfilled);
    while(pending().length) {
      await answer(pending().pop());
    }

    expect(await result()).toEqual(file);
  });
});
