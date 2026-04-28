/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import deferredPromise from '@helpers/cancellablePromise';
import makeError from '@helpers/makeError';
import fileNameRFC from '@helpers/string/fileNameRFC';
import appManagersManager from '@appManagers/appManagersManager';
import DownloadWriter from '@lib/files/downloadWriter';
import FileStorage from '@lib/files/fileStorage';

export default class DownloadStorage implements FileStorage {
  public getFile(fileName: string): Promise<any> {
    return Promise.reject(makeError('NO_ENTRY_FOUND'));
  }

  public prepareWriting({fileName, downloadId, size, mimeType}: {
    fileName: string,
    downloadId: string,
    size: number,
    mimeType?: string
  }) {
    // Android Chrome ignores RFC5987-only `filename*=` and sniffs an extension from the body if Content-Type is missing.
    const asciiFileName = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '\\$&');
    const headers = {
      'Content-Type': mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${asciiFileName}"; filename*=UTF-8''${fileNameRFC(fileName)}`,
      ...(size ? {'Content-Length': size} : {})
    };

    const serviceMessagePort = appManagersManager.getServiceMessagePort();
    const promise = serviceMessagePort.invoke('download', {
      headers,
      id: downloadId
    });

    const deferred = deferredPromise<void>();
    deferred.cancel = () => {
      deferred.reject(makeError('DOWNLOAD_CANCELED'));
    };

    deferred.catch(() => {
      appManagersManager.getServiceMessagePort().invoke('downloadCancel', downloadId);
    });

    promise.then(deferred.resolve.bind(deferred), deferred.reject.bind(deferred));

    return {
      deferred,
      getWriter: () => {
        return new DownloadWriter(serviceMessagePort, downloadId);
      }
    };
  }
}
