import {blobConstruct} from './bin_utils';

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
  
  public write(fileWriter: ReturnType<FileManager['getFakeFileWriter']>, bytes: Uint8Array | Blob | {file: any}): Promise<void> {
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
      return fileWriter.write(bytes);
    }
  }

  public getFakeFileWriter(mimeType: string, saveFileCallback: (blob: Blob) => Promise<Blob>) {
    let blobParts: Array<Uint8Array> = [];
    const fakeFileWriter = {
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
        const blob = blobConstruct(blobParts, mimeType) as Blob;
        if(saveFileCallback) {
          saveFileCallback(blob);
        }
        
        return blob;
      }
    };
    
    return fakeFileWriter;
  }
}

export default new FileManager();
