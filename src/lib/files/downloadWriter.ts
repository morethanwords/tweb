/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appManagersManager from '../appManagers/appManagersManager';
import ServiceMessagePort from '../serviceWorker/serviceMessagePort';
import StreamWriter from './streamWriter';

export default class DownloadWriter implements StreamWriter {
  constructor(
    private serviceMessagePort: ServiceMessagePort<true>,
    private downloadId: string
  ) {
    this.serviceMessagePort = appManagersManager.getServiceMessagePort();
  }

  public async write(part: Uint8Array, offset?: number) {
    return this.serviceMessagePort.invoke('downloadChunk', {
      id: this.downloadId,
      chunk: part
    });
  }

  public finalize(saveToStorage?: boolean): Promise<Blob> {
    return this.serviceMessagePort.invoke('downloadFinalize', this.downloadId).then(() => undefined);
  }
}
