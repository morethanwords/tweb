import {blobConstruct} from './bin_utils';

/* import 'web-streams-polyfill/ponyfill';
// @ts-ignore
import streamSaver from 'streamsaver';
if(window.location.href.indexOf('localhost') === -1) {
  streamSaver.mitm = 'mitm.html';
} */

class FileManager {
  public blobSupported = true;
  
  constructor() {
    try {
      blobConstruct([], '');
    } catch(e) {
      this.blobSupported = false;
    }
  }
  
  public isAvailable() {
    return this.blobSupported;
  }
  
  /* public copy(fromFileEntry: any, toFileEntry: any) {
    return this.getFileWriter(toFileEntry).then((fileWriter) => {
      return this.write(fileWriter, fromFileEntry).then(() => {
        return fileWriter;
      }, (error: any) => {
        try {
          // @ts-ignore
          fileWriter.truncate(0);
        } catch (e) {}
        
        return Promise.reject(error);
      });
    });
  } */
  public copy(fromFileEntry: any, toFileEntry: any) {
    return this.write(toFileEntry, fromFileEntry).then(() => {
      console.log('copy success');
      return toFileEntry;
    }, (error: any) => {
      console.error('copy error 1:', error);
      try {
        toFileEntry.truncate(0);
      } catch(e) {
        console.error('copy error', e);
      }
      
      return Promise.reject(error);
    });
  }
  
  /* public write(fileWriter: any, bytes: any) {
    return new Promise((resolve, reject) => {
      fileWriter.onwriteend = function(e: any) {
        resolve();
      };
      fileWriter.onerror = function(e: any) {
        reject(e);
      };
      
      if(bytes.file) {
        bytes.file((file: any) => {
          fileWriter.write(file);
        }, reject);
      } else if(bytes instanceof Blob) { // is file bytes
        fileWriter.write(bytes);
      } else {
        try {
          var blob = blobConstruct([bytesToArrayBuffer(bytes)]);
          fileWriter.write(blob);
        } catch(e) {
          reject(e);
        }
      }
    });
  } */
  
  public write(fileWriter: any, bytes: Uint8Array | Blob | {file: any}): Promise<void> {
    if('file' in bytes) {
      return bytes.file((file: any) => {
        return fileWriter.write(file);
      });
    } else if(bytes instanceof Blob) { // is file bytes
      return new Promise((resolve, reject) => {
        let fileReader = new FileReader();
        fileReader.onload = function(event) {
          let arrayBuffer = event.target.result as ArrayBuffer;
          
          let arr = new Uint8Array(arrayBuffer);
          
          fileWriter.write(arr).then(resolve, reject);
        };
        
        fileReader.readAsArrayBuffer(bytes);
      });
    } else {
      //var blob = blobConstruct([bytesToArrayBuffer(bytes)]);
      //return fileWriter.write(blob);
      return fileWriter.write(bytes);
    }
  }
  
  public chooseSaveFile(fileName: string, ext: string, mimeType: string, size?: number): any {
    throw new Error('no writer');
    /* let fileStream = streamSaver.createWriteStream(fileName, {
      size: size,
      writableStrategy: undefined,
      readableStrategy: undefined
    });
    let writer = fileStream.getWriter();
    return writer; */
  }
  
  public getFakeFileWriter(mimeType: string, saveFileCallback: any) {
    var blobParts: Array<Uint8Array> = [];
    var fakeFileWriter = {
      write: async(blob: Uint8Array) => {
        if(!this.blobSupported) {
          throw false;
        }
        
        blobParts.push(blob);
      },
      truncate: () => {
        blobParts = [];
      },
      finalize: () => {
        var blob = blobConstruct(blobParts, mimeType);
        if(saveFileCallback) {
          saveFileCallback(blob);
        }
        
        return blob;
      }
    };
    
    return fakeFileWriter;
  }
  
  public download(blob: Blob, mimeType: string, fileName: string) {
    if(window.navigator && navigator.msSaveBlob !== undefined) {
      window.navigator.msSaveBlob(blob, fileName);
      return false;
    }
    
    if(window.navigator && 'getDeviceStorage' in navigator) {
      var storageName = 'sdcard';
      var subdir = 'telegram/';
      switch(mimeType.split('/')[0]) {
        case 'video':
        storageName = 'videos';
        break;
        case 'audio':
        storageName = 'music';
        break;
        case 'image':
        storageName = 'pictures';
        break;
      }
      
      // @ts-ignore
      var deviceStorage = navigator.getDeviceStorage(storageName);
      var request = deviceStorage.addNamed(blob, subdir + fileName);
      
      request.onsuccess = function () {
        console.log('Device storage save result', this.result);
      };
      request.onerror = () => {};
      return;
    }
    
    let url = URL.createObjectURL(blob);
    var anchor = document.createElementNS('http://www.w3.org/1999/xhtml', 'a') as HTMLAnchorElement;
    anchor.href = url as string;
    anchor.download = fileName;
    if(anchor.dataset) {
      anchor.dataset.downloadurl = ['video/quicktime', fileName, url].join(':');
    }
    
    anchor.style.position = 'absolute';
    anchor.style.top = '1px';
    anchor.style.left = '1px';
    
    document.body.append(anchor);
    
    try {
      var clickEvent = document.createEvent('MouseEvents');
      clickEvent.initMouseEvent('click', true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
      anchor.dispatchEvent(clickEvent);
    } catch (e) {
      console.error('Download click error', e);
      try {
        anchor.click();
      } catch (e) {
        window.open(url as string, '_blank');
      }
    }
    
    setTimeout(() => {
      anchor.remove();
    }, 100);
  }
}

export default new FileManager();
