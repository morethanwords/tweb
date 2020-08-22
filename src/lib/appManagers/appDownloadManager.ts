import { $rootScope } from "../utils";
import apiManager from "../mtproto/mtprotoworker";

export type Download = {promise: Promise<Blob>, controller: AbortController};
export type Progress = {done: number, fileName: string, total: number, offset: number};
export type ProgressCallback = (details: Progress) => void;

export class AppDownloadManager {
  private downloads: {[fileName: string]: Download} = {};
  private progress: {[fileName: string]: Progress} = {};
  private progressCallbacks: {[fileName: string]: Array<ProgressCallback>} = {};

  constructor() {
    $rootScope.$on('download_progress', (e) => {
      const details = e.detail as {done: number, fileName: string, total: number, offset: number};
      this.progress[details.fileName] = details;

      const callbacks = this.progressCallbacks[details.fileName];
      if(callbacks) {
        callbacks.forEach(callback => callback(details));
      }
    });
  }

  public download(fileName: string, url: string) {
    if(this.downloads.hasOwnProperty(fileName)) return this.downloads[fileName];

    const controller = new AbortController();
    const promise = fetch(url, {signal: controller.signal})
    .then(res => res.blob())
    .catch(err => { // Только потому что event.request.signal не работает в SW, либо я кривой?
      if(err.name === 'AbortError') {
        //console.log('Fetch aborted');
        apiManager.cancelDownload(fileName);
        delete this.downloads[fileName];
        delete this.progress[fileName];
        delete this.progressCallbacks[fileName];
      } else {
        //console.error('Uh oh, an error!', err);
      }
      
      throw err;
    });

    //console.log('Will download file:', fileName, url);

    promise.finally(() => {
      delete this.progressCallbacks[fileName];
    });

    return this.downloads[fileName] = {promise, controller};
  }

  public getDownload(fileName: string) {
    return this.downloads[fileName];
  }

  public addProgressCallback(fileName: string, callback: ProgressCallback) {
    const progress = this.progress[fileName];
    (this.progressCallbacks[fileName] ?? (this.progressCallbacks[fileName] = [])).push(callback);

    if(progress) {
      callback(progress);
    }
  }

  private createDownloadAnchor(url: string, onRemove?: () => void) {
    const a = document.createElement('a');
    a.href = url;
  
    a.style.position = 'absolute';
    a.style.top = '1px';
    a.style.left = '1px';
    
    document.body.append(a);
  
    try {
      var clickEvent = document.createEvent('MouseEvents');
      clickEvent.initMouseEvent('click', true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
      a.dispatchEvent(clickEvent);
    } catch (e) {
      console.error('Download click error', e);
      try {
        a.click();
      } catch (e) {
        window.open(url as string, '_blank');
      }
    }
    
    setTimeout(() => {
      a.remove();
      onRemove && onRemove();
    }, 100);
  }

  /* public downloadToDisc(fileName: string, url: string) {
    this.createDownloadAnchor(url);
  
    return this.download(fileName, url);
  } */

  public downloadToDisc(fileName: string, url: string) {
    const download = this.download(fileName, url);
    download.promise.then(blob => {
      const objectURL = URL.createObjectURL(blob);
      this.createDownloadAnchor(objectURL, () => {
        URL.revokeObjectURL(objectURL);
      });
    });
  
    return download;
  }
}

export default new AppDownloadManager();