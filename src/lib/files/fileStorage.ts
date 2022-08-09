/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {CancellablePromise} from '../../helpers/cancellablePromise';
import StreamWriter from './streamWriter';

export default abstract class FileStorage {
  public abstract getFile(fileName: string): Promise<any>;
  public abstract prepareWriting(...args: any[]): {deferred: CancellablePromise<any>, getWriter: () => StreamWriter};
}
