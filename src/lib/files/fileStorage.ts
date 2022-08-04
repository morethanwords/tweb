/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import StreamWriter from "./streamWriter";

export default abstract class FileStorage {
  public abstract getFile(fileName: string): Promise<any>;

  public abstract getWriter(fileName: string, fileSize: number, mimeType: string): Promise<StreamWriter>;
}
