/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import blobConstruct from '../../helpers/blob/blobConstruct';
import StreamWriter from './streamWriter';

export default class MemoryWriter implements StreamWriter {
  private bytes: Uint8Array;

  constructor(
    private mimeType: string,
    private size: number,
    private saveFileCallback?: (blob: Blob) => Promise<Blob>
  ) {
    this.bytes = new Uint8Array(size);
  }

  public async write(part: Uint8Array, offset: number) {
    // sometimes file size can be bigger than the prov
    const endOffset = offset + part.byteLength;
    if(endOffset > this.bytes.byteLength) {
      const newBytes = new Uint8Array(endOffset);
      newBytes.set(this.bytes, 0);
      this.bytes = newBytes;
    }

    this.bytes.set(part, offset);
  };

  public truncate() {
    this.bytes = new Uint8Array();
  }

  public trim(size: number) {
    this.bytes = this.bytes.slice(0, size);
  }

  public finalize(saveToStorage = true) {
    const blob = blobConstruct(this.bytes, this.mimeType);

    if(saveToStorage && this.saveFileCallback) {
      this.saveFileCallback(blob);
    }

    return blob;
  }

  public getParts() {
    return this.bytes;
  }

  public replaceParts(parts: Uint8Array) {
    this.bytes = parts;
  }
}
