import SuperMessagePort from '@lib/superMessagePort';

type TestMethods = {
  call: (payload: {
    kind: 'badResult' | 'transfer' | 'value',
    value?: any
  }) => any,
  notify: (payload: {value: any}) => void
};

type MessageListener = (event: MessageEvent) => void;

class StructuredClonePort {
  private listeners = new Set<MessageListener>();
  public peer?: StructuredClonePort;
  public postMessageError?: Error;

  public addEventListener(type: string, listener: MessageListener) {
    if(type === 'message') {
      this.listeners.add(listener);
    }
  }

  public removeEventListener(type: string, listener: MessageListener) {
    if(type === 'message') {
      this.listeners.delete(listener);
    }
  }

  public postMessage(
    value: any,
    options?: Transferable[] | StructuredSerializeOptions
  ) {
    if(this.postMessageError) {
      throw this.postMessageError;
    }

    const transfer = Array.isArray(options) ? options : options?.transfer;
    const cloned = structuredClone(
      value,
      transfer?.length ? {transfer} : undefined
    );

    queueMicrotask(() => {
      const event = {
        currentTarget: this.peer,
        data: cloned,
        source: null
      } as unknown as MessageEvent;
      this.peer?.dispatch(event);
    });
  }

  private dispatch(event: MessageEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
}

class TestMessagePort extends SuperMessagePort<TestMethods, TestMethods, true> {
  public connect(port: StructuredClonePort) {
    this.attachListenPort(port as any);
    this.sendPorts.push(port as any);
  }

  public get awaitingCount() {
    return Object.keys(this.awaiting).length;
  }

  protected postMessage(port: any, task: any) {
    const ports: StructuredClonePort[] = Array.isArray(port) ? port : [port];
    ports.forEach((port) => port.postMessage(task, task.transfer));
  }
}

function createPair() {
  const clientPort = new StructuredClonePort();
  const workerPort = new StructuredClonePort();
  clientPort.peer = workerPort;
  workerPort.peer = clientPort;

  const client = new TestMessagePort();
  const worker = new TestMessagePort();
  client.connect(clientPort);
  worker.connect(workerPort);

  return {client, worker, clientPort, workerPort};
}

describe('SuperMessagePort structured-clone failures', () => {
  test('degrades an uncloneable batch and keeps cloneable sibling invokes alive', async() => {
    const {client, worker} = createPair();
    worker.addEventListener('call', (payload) => payload.value);

    const badPromise = client.invoke('call', {
      kind: 'value',
      value: () => {}
    });
    const goodPromise = client.invoke('call', {
      kind: 'value',
      value: 'ok'
    });

    await Promise.all([
      expect(badPromise).rejects.toMatchObject({type: 'DATA_CLONE_ERROR'}),
      expect(goodPromise).resolves.toBe('ok')
    ]);
    expect(client.awaitingCount).toBe(0);
  });

  test('replaces uncloneable result and cached ack payloads with clone-safe errors', async() => {
    const {client, worker} = createPair();
    worker.addEventListener('call', (payload) => {
      return payload.kind === 'badResult' ? () => {} : payload.value;
    });

    const resultPromise = client.invoke('call', {kind: 'badResult'});
    const ackPromise = client.invoke('call', {kind: 'badResult'}, true);

    await Promise.all([
      expect(resultPromise).rejects.toMatchObject({type: 'DATA_CLONE_ERROR'}),
      expect(ackPromise).rejects.toMatchObject({type: 'DATA_CLONE_ERROR'})
    ]);
    expect(client.awaitingCount).toBe(0);
  });

  test('preserves transferable results and drops only an uncloneable void invoke', async() => {
    const {client, worker} = createPair();
    const received: any[] = [];
    worker.addEventListener('call', () => {
      const buffer = new Uint8Array([1, 2, 3]).buffer;
      return new SuperMessagePort.TransferableResult(buffer, [buffer]);
    });
    worker.addEventListener('notify', ({value}) => {
      received.push(value);
    });

    client.invokeVoid('notify', {value: () => {}});
    client.invokeVoid('notify', {value: 'ok'});

    const result = await client.invoke('call', {kind: 'transfer'});
    expect([...new Uint8Array(result)]).toEqual([1, 2, 3]);
    await vi.waitFor(() => expect(received).toEqual(['ok']));
    expect(client.awaitingCount).toBe(0);
  });

  test('rejects an invoke locally when a closed port cannot accept its batch', async() => {
    const {client, clientPort} = createPair();
    const error = new Error('MessagePort is closed');
    error.name = 'InvalidStateError';
    clientPort.postMessageError = error;

    const promise = client.invoke('call', {
      kind: 'value',
      value: 'never delivered'
    });

    await expect(promise).rejects.toBe(error);
    expect(client.awaitingCount).toBe(0);
  });
});
