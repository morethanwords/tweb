/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import deferredPromise from '../../helpers/cancellablePromise';
import makeError from '../../helpers/makeError';
import fileNameRFC from '../../helpers/string/fileNameRFC';
import appManagersManager from '../appManagers/appManagersManager';
import DownloadWriter from './downloadWriter';
import FileStorage from './fileStorage';

export default class DownloadStorage implements FileStorage {
  public getFile(fileName: string): Promise<any> {
    return Promise.reject(makeError('NO_ENTRY_FOUND'));
  }

  public prepareWriting({fileName, downloadId, size}: {
    fileName: string,
    downloadId: string,
    size: number
  }) {
    const headers = {
      // 'Content-Type': 'application/octet-stream; charset=utf-8',
      // 'Content-Type': EXTENSION_MIME_TYPE_MAP[fileName.split('.').pop() as keyof typeof EXTENSION_MIME_TYPE_MAP] || 'application/octet-stream; charset=utf-8',
      'Content-Disposition': 'attachment; filename*=UTF-8\'\'' + fileNameRFC(fileName),
      // 'Content-Disposition': `attachment; filename="${fileNameRFC(fileName)}"`,
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
