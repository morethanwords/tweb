/*
 * A result the client cannot read — nested deeper than the parser's stack goes, say — reads the same way every
 * time it comes. Its request fails with that, instead of waiting for good and being sent again on every reconnect.
 */

import '../lib/crypto/crypto.worker';
import {TLSerialization} from '@lib/mtproto/tl_utils';
import {makeAuthorizedNetworker} from '@/tests/networkerHarness';

const RPC_RESULT = 0xf35c6d01;

/** `textBold` nested `depth` times around `textEmpty`, as the server would send it. */
function deepRichTextBytes(depth: number) {
  const one = new TLSerialization();
  one.storeObject({_: 'textBold', text: {_: 'textEmpty'}}, 'RichText');
  const [bold, empty] = [one.getBytes(true).slice(0, 4), one.getBytes(true).slice(4, 8)];
  const bytes = new Uint8Array(4 * (depth + 1));
  for(let level = 0; level < depth; ++level) bytes.set(bold, level * 4);
  bytes.set(empty, depth * 4);
  return bytes;
}

test('a request whose result cannot be read fails, and nothing of it is left waiting', async() => {
  const networker = await makeAuthorizedNetworker();
  const promise = networker.wrapApiCall('help.getConfig');
  let error: ApiError;
  promise.catch((err) => error = err);
  const sentMessages = (networker as any).sentMessages as Record<string, any>;
  const [msgId] = Object.keys(sentMessages);
  sentMessages[msgId].resultType = 'RichText';

  const serializer = new TLSerialization({mtproto: true});
  serializer.storeInt(RPC_RESULT, 'rpc_result');
  serializer.storeLong(msgId, 'req_msg_id');
  const header = serializer.getBytes(true);
  const result = deepRichTextBytes(100000);
  const body = new Uint8Array(header.length + result.length);
  body.set(header);
  body.set(result, header.length);

  const message = (networker as any).parseResponseMessageBody(body);
  expect(message.result).toEqual({_: 'rpc_error', error_code: 400, error_message: 'NETWORK_RESULT_UNREADABLE'});

  networker.processMessage(message, '7000000000000000000', undefined);
  await vi.waitFor(() => expect(error).toMatchObject({type: 'NETWORK_RESULT_UNREADABLE', code: 400}));
  expect(sentMessages[msgId]).toBeUndefined();
});
