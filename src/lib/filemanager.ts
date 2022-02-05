/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import blobConstruct from "../helpers/blob/blobConstruct";
import readBlobAsUint8Array from "../helpers/blob/readBlobAsUint8Array";

export class FileManager {
  private blobSupported = true;
  
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
  
  public write(fileWriter: ReturnType<FileManager['getFakeFileWriter']>, bytes: Uint8Array | Blob | string): Promise<void> {
    if(bytes instanceof Blob) { // is file bytes
      return readBlobAsUint8Array(bytes).then(arr => {
        return fileWriter.write(arr);
      });
    } else {
      return fileWriter.write(bytes);
    }
  }

  public getFakeFileWriter(mimeType: string, saveFileCallback?: (blob: Blob) => Promise<Blob>) {
    const blobParts: Array<Uint8Array | string> = [];
    const fakeFileWriter = {
      write: async(part: Uint8Array | string) => {
        if(!this.blobSupported) {
          throw false;
        }
        
        blobParts.push(part);
      },
      truncate: () => {
        blobParts.length = 0;
      },
      finalize: (saveToStorage = true) => {
        const blob = blobConstruct(blobParts, mimeType);

        if(saveToStorage && saveFileCallback) {
          saveFileCallback(blob);
        }
        
        return blob;
      }
    };
    
    return fakeFileWriter;
  }
}

export default new FileManager();
