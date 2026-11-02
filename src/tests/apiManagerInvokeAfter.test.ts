import makeError from '@helpers/makeError';
import pause from '@helpers/schedulers/pause';
import deferred from './helpers/deferred';
import {logger} from '@lib/logger';
import type {InvokeApiOptions} from '@types';

// Sends to a chat go one after another (invokeApiAfter: invokeAfterMsg of the one on its way). When the one before
// fails, the server answers the next with MSG_WAIT_FAILED; when it takes too long, with MSG_WAIT_TIMEOUT. The next
// one is then sent on its own once the one before is over, whichever way it went, as tdesktop resends it
// (mtp_instance.cpp, MSG_WAIT_*): it was failed with the error of the one before instead - a text sent right after a
// sticker the chat does not allow came out as not sent, with the sticker's error.

type Call = {method: string, params: any, afterMessageId?: string};

function makeAccount(answer: (call: Call, index: number) => Promise<any>) {
  const calls: Call[] = [];
  let msgId = 0;
  const networker = {
    dcId: 2,
    isStopped: () => false,
    attachPromise: () => {},
    wrapApiCall: (method: string, params: any, options: InvokeApiOptions & {messageId?: string}) => {
      const call: Call = {method, params, afterMessageId: options.afterMessageId};
      options.messageId = '' + ++msgId;
      calls.push(call);
      return pause(1).then(() => answer(call, calls.length - 1));
    }
  };

  return {calls, networker};
}

async function makeApiManager(answer: Parameters<typeof makeAccount>[0]) {
  const {calls, networker} = makeAccount(answer);
  const {ApiManager} = await import('@appManagers/apiManager');
  const apiManager = new ApiManager();
  Object.assign(apiManager, {
    baseDcId: 2,
    log: logger('API-TEST'),
    getAccountNumber: () => 1,
    getNetworker: async() => networker
  });

  return {apiManager, calls};
}

const apiError = (type: string, code = 400) => Object.assign(makeError(type as ErrorType), {code});

// * `first` sent, and `second` right after it, while it is on its way
function sendOneAfterAnother(apiManager: Awaited<ReturnType<typeof makeApiManager>>['apiManager'], first: string, second: string) {
  const firstOptions: InvokeApiOptions = {noErrorBox: true};
  const firstSent = apiManager.invokeApiAfter('messages.sendMessage', {message: first} as any, firstOptions);
  const secondSent = apiManager.invokeApiAfter('messages.sendMessage', {message: second} as any, {
    noErrorBox: true,
    afterMessageId: (firstOptions as any).messageId
  });

  return [firstSent, secondSent];
}

describe('a send after another', () => {
  test('goes on its own once the one before it has failed, and is not failed with its error', async() => {
    const {apiManager, calls} = await makeApiManager(async(call) => {
      if(call.params.message === 'sticker') throw apiError('CHAT_SEND_STICKERS_FORBIDDEN', 403);
      if(call.afterMessageId) throw apiError('MSG_WAIT_FAILED');
      return {_: 'updates', sent: call.params.message};
    });

    const [sticker, text] = sendOneAfterAnother(apiManager, 'sticker', 'text');

    await expect(sticker).rejects.toMatchObject({type: 'CHAT_SEND_STICKERS_FORBIDDEN'});
    expect(await text).toEqual({_: 'updates', sent: 'text'});
    // * first after the sticker, then on its own
    expect(calls.map(({params, afterMessageId}) => [params.message, !!afterMessageId])).toEqual([
      ['sticker', false],
      ['text', true],
      ['text', false]
    ]);
  });

  test('that waited too long goes again once the one before it is through', async() => {
    const released = deferred<void>();
    const {apiManager, calls} = await makeApiManager(async(call) => {
      if(call.params.message === 'slow') {
        await released.promise;
        return {_: 'updates', sent: 'slow'};
      }

      if(call.afterMessageId) throw apiError('MSG_WAIT_TIMEOUT');
      return {_: 'updates', sent: call.params.message};
    });

    const [slow, next] = sendOneAfterAnother(apiManager, 'slow', 'next');

    await vi.waitFor(() => expect(calls.length).toBe(2));
    await pause(10);
    // * not sent again before the one it waited for is through
    expect(calls.length).toBe(2);

    released.resolve();
    expect(await slow).toEqual({_: 'updates', sent: 'slow'});
    expect(await next).toEqual({_: 'updates', sent: 'next'});
    expect(calls.map(({params}) => params.message)).toEqual(['slow', 'next', 'next']);
  });
});
