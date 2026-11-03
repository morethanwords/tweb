import makeUploadFileManager from '@/tests/helpers/uploadFileManager';
import withTimeout from '@helpers/schedulers/withTimeout';

/*
 * An upload always ends: a file of no bytes has no part to send - the server takes no empty one - so its upload
 * is refused at once. It used to send nothing and never settle, and the message being sent spun for good.
 */
function makeManager() {
  const {manager} = makeUploadFileManager();
  // * the part is sent at once, as the request queue would when its turn comes
  (manager as any).downloadRequest = vi.fn(({cb}: {cb: () => Promise<unknown>}) => cb());
  return manager;
}

// * what the upload came to within a moment: still pending, or how it settled
function settled(promise: Promise<unknown>) {
  return withTimeout(promise.then((value) => ({resolved: value}), (error) => ({rejected: error})), 200, 'pending');
}

describe('ApiFileManager.upload', () => {
  it('refuses a file of no bytes instead of never ending', async() => {
    const manager = makeManager();
    const result = await settled(manager.upload({file: new File([], 'empty.txt')}));
    expect(result).toMatchObject({rejected: {type: 'FILE_EMPTY'}});
    expect((manager as any).apiManager.invokeApi).not.toHaveBeenCalled();
  });

  it('uploads a file that has bytes', async() => {
    const manager = makeManager();
    const result = await settled(manager.upload({file: new File(['text'], 'text.txt')}));
    expect(result).toMatchObject({resolved: {_: 'inputFile', parts: 1}});
  });
});
