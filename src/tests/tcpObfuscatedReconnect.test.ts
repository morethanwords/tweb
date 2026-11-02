import '@lib/polyfill';
import {createCipheriv, createDecipheriv} from 'node:crypto';
import EventListenerBase from '@helpers/eventListenerBase';
import deferredPromise from '@helpers/cancellablePromise';
import pause from '@helpers/schedulers/pause';
import cryptoMessagePort from '@lib/crypto/cryptoMessagePort';
import abridgedPacketCodec from '@lib/mtproto/transports/abridged';
import TcpObfuscated from '@lib/mtproto/transports/tcpObfuscated';
import {MTConnection, MTConnectionEvents} from '@lib/mtproto/transports/transport';
import {registerInlineCrypto} from './api/inlineCrypto';

// A socket is obfuscated with a stream cipher whose keys are made anew for
// every connection, out of the 64 bytes that open it. Before a networker is
// attached (the handshake of a permanent or a temporary key) the transport
// keeps the requests it sent and sends them again once it has reconnected -
// so what it sends there has to be encrypted for the new connection, or the
// server reads noise and the handshake waits for an answer forever.

registerInlineCrypto();

// * a socket closing would otherwise send the controller pinging the real servers
vi.mock('@lib/mtproto/transports/controller', () => ({
  default: {setTransportOpened: () => {}, setTransportClosed: () => {}}
}));

class FakeConnection extends EventListenerBase<MTConnectionEvents> implements MTConnection {
  public static instances: FakeConnection[] = [];
  public sent: Uint8Array[] = [];

  constructor() {
    super();
    FakeConnection.instances.push(this);
  }

  public send = (body: Uint8Array) => {
    this.sent.push(body.slice());
  };

  public close = () => {
    this.dispatchEvent('close');
  };
}

// * the server's side of one connection: it takes its keys out of the opening 64 bytes
function serverOf(connection: FakeConnection) {
  const [init, ...packets] = connection.sent;
  const reversed = init.slice().reverse();
  const decipher = createDecipheriv('aes-256-ctr', init.slice(8, 40), init.slice(40, 56));
  const cipher = createCipheriv('aes-256-ctr', reversed.slice(8, 40), reversed.slice(40, 56));
  const head = new Uint8Array(decipher.update(init));
  expect([...head.slice(56, 60)]).toEqual([0xef, 0xef, 0xef, 0xef]);

  return {
    received: packets.map((packet) => abridgedPacketCodec.readPacket(new Uint8Array(decipher.update(packet)))),
    answer: (body: Uint8Array) => {
      const encrypted = new Uint8Array(cipher.update(abridgedPacketCodec.encodePacket(body)));
      connection.dispatchEvent('message', encrypted.buffer);
    }
  };
}

const waitFor = (check: () => boolean) => vi.waitFor(() => {
  if(!check()) throw new Error('not yet');
}, {timeout: 2000, interval: 5});

async function open(connection: FakeConnection) {
  connection.dispatchEvent('open');
  await waitFor(() => connection.sent.length >= 1);
}

// * the connection drops before the answer comes, and the transport opens another one
async function dropAndReopen(connection: FakeConnection) {
  connection.dispatchEvent('close');
  await waitFor(() => FakeConnection.instances.length === 2);
  const next = FakeConnection.instances[1];
  await open(next);
  return next;
}

const request = new Uint8Array([...Array(40)].map((_, i) => i + 1));
const response = new Uint8Array([...Array(24)].map((_, i) => 200 + i));

// * the server reads the request on `connection`, and its answer is the one the request gets
async function expectAnsweredOn(connection: FakeConnection, answered: Promise<Uint8Array>) {
  const server = serverOf(connection);
  expect(server.received).toEqual([request]);

  server.answer(response);
  expect(await answered).toEqual(response);
}

function makeTransport() {
  FakeConnection.instances.length = 0;
  // * no networker: a plain request waits for the answer the way the authorizer's do
  const transport = new TcpObfuscated(FakeConnection, 2, 'wss://test', '-test', 0);
  return {transport, first: FakeConnection.instances[0]};
}

describe('a plain request over an obfuscated socket that reconnects', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('goes again encrypted for the new connection and gets its answer there', async() => {
    const {transport, first} = makeTransport();
    await open(first);

    const answered = transport.send(request) as any as Promise<Uint8Array>;
    await waitFor(() => first.sent.length === 2);
    expect(serverOf(first).received).toEqual([request]);

    const second = await dropAndReopen(first);
    await waitFor(() => second.sent.length === 2);
    await expectAnsweredOn(second, answered);

    transport.destroy();
  });

  test('is not sent with the old connection\'s bytes when it was being encrypted as that one went', async() => {
    const {transport, first} = makeTransport();
    await open(first);

    // * the encryption of the request is answered only once the next connection is open
    const held = deferredPromise<void>();
    const invokeCryptoNew = cryptoMessagePort.invokeCryptoNew.bind(cryptoMessagePort);
    let holding = true;
    vi.spyOn(cryptoMessagePort, 'invokeCryptoNew').mockImplementation(((payload: any) => {
      const result = invokeCryptoNew(payload);
      const [{data, operation}] = payload.args;
      if(holding && payload.method === 'aes-ctr-process' && operation === 'encrypt' && data.length !== 64) {
        holding = false;
        return held.then(() => result);
      }

      return result;
    }) as any);

    const answered = transport.send(request) as any as Promise<Uint8Array>;
    await waitFor(() => !holding);

    const second = await dropAndReopen(first);

    held.resolve();
    await waitFor(() => second.sent.length >= 2);
    // * a little longer, for anything else that would follow it
    await pause(50);

    expect(first.sent.length).toBe(1);
    await expectAnsweredOn(second, answered);

    transport.destroy();
  });
});
