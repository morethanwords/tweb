import {CancellablePromise} from '@helpers/cancellablePromise';
import StreamWriter from '@lib/files/streamWriter';

export default abstract class FileStorage {
  public abstract getFile(fileName: string): Promise<any>;
  public abstract prepareWriting(...args: any[]): {deferred: CancellablePromise<any>, getWriter: () => StreamWriter};
}
