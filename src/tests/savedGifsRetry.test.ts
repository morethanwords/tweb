import {expect, test, vi} from 'vitest';
import AppGifsManager from '@appManagers/appGifsManager';

const gif = {_: 'document', id: '1'};

// * a failed request is not the list: one that failed once (offline, a timeout) is asked for again, both by the
// * panel opened next and by updateSavedGifs, instead of the failure being kept for the whole session
test('asks for the saved GIFs again after a request that failed', async() => {
  const manager = new AppGifsManager();
  const invokeApi = vi.fn()
  .mockRejectedValueOnce({type: 'NETWORK_BAD_REQUEST'})
  .mockResolvedValue({_: 'messages.savedGifs', hash: '1', gifs: [gif]});
  Object.assign(manager as any, {
    apiManager: {invokeApi},
    appDocsManager: {saveDoc: (doc: unknown) => doc}
  });

  await expect(manager.getGifs()).rejects.toMatchObject({type: 'NETWORK_BAD_REQUEST'});

  expect(await manager.getGifs()).toEqual([gif]);
  expect(invokeApi).toHaveBeenCalledTimes(2);
});
