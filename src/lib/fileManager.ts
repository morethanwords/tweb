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
  
  public getFakeFileWriter(mimeType: string, size: number, saveFileCallback?: (blob: Blob) => Promise<Blob>) {
    let bytes: Uint8Array = new Uint8Array(size);
    const fakeFileWriter = {
      write: async(part: Uint8Array, offset: number) => {
        if(!this.blobSupported) {
          throw false;
        }
        
        // sometimes file size can be bigger than the prov
        const endOffset = offset + part.byteLength;
        if(endOffset > bytes.byteLength) {
          const newBytes = new Uint8Array(endOffset);
          newBytes.set(bytes, 0);
          bytes = newBytes;
        }

        bytes.set(part, offset);
      },
      truncate: () => {
        bytes = new Uint8Array();
      },
      trim: (size: number) => {
        bytes = bytes.slice(0, size);
      },
      finalize: (saveToStorage = true) => {
        const blob = blobConstruct(bytes, mimeType);

        if(saveToStorage && saveFileCallback) {
          saveFileCallback(blob);
        }
        
        return blob;
      },
      getParts: () => bytes,
      replaceParts: (parts: typeof bytes) => {
        bytes = parts;
      }
    };
    
    return fakeFileWriter;
  }
}

export default new FileManager();
