import blobConstruct from '@helpers/blob/blobConstruct';
import StreamWriter from '@lib/files/streamWriter';

// * Every in-flight download holds a whole-file buffer here, so an abandoned download is a buffer
// * nothing ever frees. Tracked through WeakRefs on purpose: a strong registry would BE the leak it
// * is meant to measure. The refs themselves are dropped as their writers are collected - a
// * prune-on-read Set would still grow one dead ref per download forever. See memoryStats.
const liveWriters: Set<WeakRef<MemoryWriter>> = new Set();
const collected = new FinalizationRegistry<WeakRef<MemoryWriter>>((ref) => liveWriters.delete(ref));

export function getMemoryWriterStats() {
  let writers = 0, bytes = 0;
  for(const ref of liveWriters) {
    const writer = ref.deref();
    if(!writer) { // collected but the callback has not run yet
      continue;
    }

    ++writers;
    bytes += writer.byteLength;
  }

  return {writers, bytes};
}

export default class MemoryWriter implements StreamWriter {
  private bytes: Uint8Array;

  constructor(
    private mimeType: string,
    private size: number,
    private saveFileCallback?: (blob: Blob) => Promise<Blob>
  ) {
    this.bytes = new Uint8Array(size);
    const ref = new WeakRef(this);
    liveWriters.add(ref);
    collected.register(this, ref);
  }

  public get byteLength() {
    return this.bytes.byteLength;
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
