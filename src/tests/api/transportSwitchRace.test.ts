import MTPNetworker from '@lib/mtproto/networker';
import HTTP from '@lib/mtproto/transports/http';
import MTTransport from '@lib/mtproto/transports/transport';
import {randomLong} from '@helpers/random';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import noop from '@helpers/noop';
import pause from '@helpers/schedulers/pause';
import {makeAuthorizedNetworker} from '../networkerHarness';
import {registerInlineCrypto} from './inlineCrypto';

// The app starts on `https` and moves to `websocket` as soon as the socket
// answers a ping (Modes.multipleTransports -> apiManager.changeTransportType),
// so a networker can have its transport swapped while a message of its own is
// still being encrypted. Whether an answer comes back in the response to
// `send` is a property of the transport that takes the bytes - reading
// `this.transport` again after the encryption await answered it for a
// different one, and an HTTP follow-up was run over a socket send that returns
// nothing at all.

registerInlineCrypto();

// * a socket as the networker sees it: `send` returns nothing (MTTransport)
// * and the answer arrives later through `onTransportData`, cf. tcpObfuscated
class FakeSocket implements MTTransport {
  public networker: MTPNetworker;
  public noScheduler: boolean;
  public connected = true;
  public sent: Uint8Array[] = [];

  public send(data: Uint8Array) {
    this.sent.push(data);
  }

  public destroy() {}
}

function makeHTTP() {
  const http = new HTTP(2, 'http://127.0.0.1:1/', '-test');
  const responses: CancellablePromise<Uint8Array>[] = [];
  // * no fetch in here: every send is answered by hand
  (http as any)._send = () => {
    const deferred = deferredPromise<Uint8Array>();
    responses.push(deferred);
    return deferred;
  };

  return {http, responses};
}

// * what `changeTransport` leaves the networker with, without the long poll
// * and the connection check it also starts for an HTTP transport - those send
// * messages of their own and are not what these tests are about
function attachTransport(networker: MTPNetworker, transport: MTTransport) {
  transport.networker = networker;
  transport.noScheduler = true;
  networker.transport = transport;
}

// * swaps the transport in the window the bug lived in: the message has been
// * encrypted and `sendEncryptedRequest` has not looked at the transport yet
function swapAfterEncryption(networker: MTPNetworker, swap: () => void) {
  const getEncryptedOutput = (networker as any).getEncryptedOutput.bind(networker);
  let swapped = false;
  (networker as any).getEncryptedOutput = async(...args: any[]) => {
    const requestData = await getEncryptedOutput(...args);
    if(!swapped) {
      swapped = true;
      swap();
    }

    return requestData;
  };
}

function sendPing(networker: MTPNetworker) {
  networker.wrapMtpCall('ping', {ping_id: randomLong()}, {}).catch(noop);
}

describe('a transport swapped while a message is being encrypted', () => {
  test('does not run the HTTP follow-up over a socket send that answers nothing', async() => {
    const networker = await makeAuthorizedNetworker();
    const {http, responses} = makeHTTP();
    const socket = new FakeSocket();
    attachTransport(networker, http);

    const onTransportData = vi.spyOn(networker, 'onTransportData');
    // * the real trigger: apiManager.changeTransportType -> changeTransport
    swapAfterEncryption(networker, () => networker.changeTransport(socket));

    sendPing(networker);

    await vi.waitFor(() => expect(socket.sent.length).toBeGreaterThan(0));
    await pause(0);

    // * the bytes went to the socket, so its own read loop brings the answer
    expect(responses).toHaveLength(0);
    expect(onTransportData).not.toHaveBeenCalled();
  });

  test('settles the long poll it carried over to the socket', async() => {
    const networker = await makeAuthorizedNetworker();
    const {http, responses} = makeHTTP();
    const socket = new FakeSocket();
    attachTransport(networker, http);

    swapAfterEncryption(networker, () => attachTransport(networker, socket));

    (networker as any).sendLongPoll();
    expect((networker as any).sendingLongPoll).toBe(true);

    await vi.waitFor(() => expect(socket.sent.length).toBeGreaterThan(0));
    expect(responses).toHaveLength(0);

    // * nothing over the socket answers an http_wait, and left pending it
    // * keeps every later long poll from being sent at all
    await vi.waitFor(() => expect((networker as any).sendingLongPoll).toBeUndefined());
  });

  test('hands the HTTP answer to onTransportData when the socket gave way to HTTP', async() => {
    const networker = await makeAuthorizedNetworker();
    const {http, responses} = makeHTTP();
    const socket = new FakeSocket();
    attachTransport(networker, socket);

    const onTransportData = vi.spyOn(networker, 'onTransportData');
    swapAfterEncryption(networker, () => attachTransport(networker, http));

    sendPing(networker);

    await vi.waitFor(() => expect(responses).toHaveLength(1));
    expect(socket.sent).toHaveLength(0);

    // * a bare -404: a transport error needs no key to be read
    const packet = new Uint8Array(new Int32Array([-404]).buffer);
    responses[0].resolve(packet);

    await vi.waitFor(() => expect(onTransportData).toHaveBeenCalled());
    expect(onTransportData.mock.calls[0][0]).toBe(packet);
  });
});

describe('a message that could not be encrypted', () => {
  test('is sent again, and does not leave its long poll pending', async() => {
    const networker = await makeAuthorizedNetworker();
    const {http} = makeHTTP();
    attachTransport(networker, http);

    const error = new Error('no key to encrypt with');
    (networker as any).getEncryptedOutput = async() => {
      throw error;
    };

    const pushResend = vi.spyOn(networker as any, 'pushResend');
    vi.spyOn((networker as any).log, 'error').mockImplementation(noop);

    (networker as any).sendLongPoll();

    // * nothing went out, so the batch has to go out again - and nothing else
    // * would ever settle the http_wait it was carrying
    await vi.waitFor(() => expect(pushResend).toHaveBeenCalled());
    await vi.waitFor(() => expect((networker as any).sendingLongPoll).toBeUndefined());
  });
});

describe('onTransportData without a packet', () => {
  test('says so instead of throwing, and resends what nothing answered', async() => {
    const networker = await makeAuthorizedNetworker();
    attachTransport(networker, new FakeSocket());

    const resend = vi.spyOn(networker, 'resend');
    const log = vi.spyOn((networker as any).log, 'error').mockImplementation(noop);

    // * no packet at all: a send that was to bring an answer brought nothing
    await expect(networker.onTransportData(undefined)).resolves.toBeUndefined();
    expect(resend).toHaveBeenCalledTimes(1);

    // * an empty frame off a socket carries no answer to recover
    await expect(networker.onTransportData(new Uint8Array(0))).resolves.toBeUndefined();
    expect(resend).toHaveBeenCalledTimes(1);

    expect(log).toHaveBeenCalledTimes(2);
  });
});
