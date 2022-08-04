/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default abstract class StreamWriter {
  public abstract write(part: Uint8Array, offset?: number): Promise<any>;
  public abstract truncate?(): void;
  public abstract trim?(size: number): void;
  public abstract finalize(saveToStorage?: boolean): Promise<Blob> | Blob;
  public abstract getParts?(): Uint8Array;
  public abstract replaceParts?(parts: Uint8Array): void;
}
