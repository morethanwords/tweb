/*
 * TON Connect's flow in a tab (components/wallet/tonConnect): one interaction at a time, an answer on its way is
 * never taken from under the user — a request's time running out while it goes, or its sheet closed, waits for its
 * outcome, and a connection being approved is never declined behind it — a session the server closes while a sheet is
 * up is closed once the sheet goes, never by asking for the key, and a request's times are read by the server's clock,
 * never by a device's that runs ahead or behind. The protocol is made up; the request sheet is the
 * real one over a stand-in popup.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const fake = vi.hoisted(() => {
  const NOW = 1_800_000_000;
  const listeners = new Map<string, Set<(value: any) => void>>();
  const status = {presence: 'ready', date: 0, state: {_: 'walletState', pFlags: {}, address: 'EQAddress', balance: '0'}};
  const session = {_: 'tonConnectSession', pFlags: {}, id: '77', dapp_client_id: 'ab'.repeat(32), client_id: 'cd'.repeat(32), nonce: new Uint8Array(16), date: NOW};

  return {
    NOW,
    status,
    session,
    rootScope: {
      myId: 1,
      addEventListener: (name: string, callback: (value: any) => void) => {
        if(!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(callback);
      },
      removeEventListener: (name: string, callback: (value: any) => void) => listeners.get(name)?.delete(callback),
      dispatchEvent: (name: string, value: any) => listeners.get(name)?.forEach((callback) => callback(value)),
      managers: {
        timeManager: {getServerTime: vi.fn(async() => NOW)},
        appWalletManager: {
          getStatus: vi.fn(async() => status),
          getRates: vi.fn(async() => ({rates: {}, date: 0})),
          getTonConnectSessions: vi.fn(async(): Promise<any[]> => []),
          getTonConnectOwnershipDomain: vi.fn(async() => 'wallet.telegram.org'),
          tonConnectGetPending: vi.fn(async(_lookup: {sessionId: string}): Promise<any> => ({session}))
        }
      }
    },
    walletSession: {
      // * the account's managers: the stand-in tab's
      get managers() {
        return fake.rootScope.managers;
      },
      ui: undefined as any,
      vault: {isUnlocked: vi.fn(() => true), unlockSilently: vi.fn(async() => true)},
      getDeviceMode: vi.fn(async() => 'full'),
      cancelPreview: vi.fn()
    },
    lib: {
      answerTonConnectConnect: vi.fn(),
      answerTonConnectRequest: vi.fn(),
      checkTonConnectManifest: vi.fn(() => ({name: 'App', domain: 'app.example', url: 'https://app.example'})),
      createTonConnectSession: vi.fn(),
      findTonConnectRequest: vi.fn(),
      openTonConnectRequest: vi.fn()
    },
    toasts: [] as string[],
    connected: vi.fn(),
    /** the wallet's goodbye to sessions: `disconnectTonConnectSessions` */
    disconnect: vi.fn(async(_status: unknown, _sessions: unknown[]) => {}),
    /** the connect sheet's options: the flow's side of it */
    connect: undefined as any,
    /** the request sheet on screen: its stand-in popup's props, and its hide */
    popup: undefined as {props?: any, closed: boolean, hide: () => void}
  };
});

vi.mock('@lib/rootScope', () => ({default: fake.rootScope}));
vi.mock('@lib/wallet/walletSession', () => ({default: {get: () => fake.walletSession}}));
vi.mock('@lib/wallet/tonConnect', () => ({
  ...fake.lib,
  disconnectTonConnectSessions: fake.disconnect,
  getStoredTonConnectReply: (): undefined => undefined,
  getTonConnectRequestKey: (sessionId: string, msgId: number) => String(sessionId) + ':' + msgId,
  isTonConnectRequestSilent: () => false,
  isTonConnectSessionActive: (session: any) => !!session && !session.pFlags.pending && !session.pFlags.closing && !session.pFlags.closed,
  previewTonConnectRequest: () => new Promise(() => {}),
  retryTonConnectReplies: async() => {},
  tonConnectFailure: (err: any) => err?.failure
}));
vi.mock('@components/wallet/vaultPrompts', () => ({default: () => ({})}));
vi.mock('@components/wallet/send', () => ({isUserCancel: (err: any) => err?.type === 'USER_CANCEL'}));
vi.mock('@components/wallet/alerts', () => ({toastWallet: fake.connected, showWalletAlert: vi.fn()}));
vi.mock('@components/toast', () => ({toastNew: ({langPackKey}: {langPackKey: string}) => fake.toasts.push(langPackKey)}));
vi.mock('@lib/richTextProcessor/wrapEmojiText', () => ({default: (text: string) => document.createTextNode(text)}));
vi.mock('@components/wallet/tonConnect/connectPopup', () => ({
  default: (options: any) => {
    fake.connect = options;
    return {close: vi.fn()};
  }
}));
vi.mock('@components/wallet/tonConnect/parts', () => ({
  getTonConnectFailureText: (failure: string) => 'failure:' + failure,
  showTonConnectFailure: (failure: string) => fake.toasts.push('failure:' + failure),
  TonConnectAppIcon: (): null => null,
  TonConnectText: (props: any) => props.children,
  PopupCloser: (props: {register: (hide: () => void) => void}): null => {
    const popup = fake.popup;
    props.register(() => popup.hide());
    return null;
  }
}));
vi.mock('@lib/langPack', () => ({
  default: {format: (key: string) => key},
  i18n: (key: string) => {
    const element = document.createElement('span');
    element.textContent = key;
    return element;
  }
}));
vi.mock('@components/mediaHeader', () => {
  const MediaHeader = (props: any) => <div>{props.children}</div>;
  MediaHeader.Sticker = (): null => null;
  MediaHeader.Title = (props: any) => <h2>{props.children}</h2>;
  MediaHeader.Subtitle = (props: any) => <div>{props.children}</div>;
  return {default: MediaHeader};
});
vi.mock('@components/section', () => ({default: (props: any) => <div>{props.children}</div>}));
vi.mock('@components/rowTsx', () => {
  const Row = (props: any) => <div>{props.children}</div>;
  Row.Title = Row.Subtitle = Row.RightContent = Row;
  return {default: Row};
});
vi.mock('@components/iconTsx', () => ({IconTsx: (): null => null}));
vi.mock('@components/wallet/store', () => ({readCurrency: () => 'USD'}));
vi.mock('@components/wallet/format', () => ({
  formatFiat: () => '',
  formatGrams: (value: string) => value,
  formatGramsCut: (value: string) => value,
  shortAddress: (value: string) => value
}));
vi.mock('@components/popups/indexTsx', async() => {
  const {render} = await import('solid-js/web');
  const PopupElement = (props: any) => {
    fake.popup.props = props;
    return <div>{props.children}</div>;
  };
  const Plain = (props: any) => <div>{props.children}</div>;
  PopupElement.Header = PopupElement.Scrollable = PopupElement.Body = PopupElement.Footer = Plain;
  PopupElement.CloseButton = (): null => null;
  // * like the real one: busy while its promise is, a resolved one closes the popup, a rejected one stays
  PopupElement.FooterButton = (props: any) => {
    const popup = fake.popup;
    return (
      <button
        data-lang-key={props.langKey}
        disabled={props.disabled}
        onClick={async(event) => {
          if(popup.closed) return;
          const button = event.currentTarget;
          button.dataset.pending = '1';
          const result = await props.callback?.();
          delete button.dataset.pending;
          if(result !== false) popup.hide();
        }}
      >{props.langKey}</button>
    );
  };

  return {
    default: PopupElement,
    createPopup: (factory: () => any) => {
      const container = document.createElement('div');
      document.body.append(container);
      // * a hide is only ever called once the popup is rendered
      const popup: typeof fake.popup = {
        closed: false,
        hide: () => {
          if(popup.closed) return;
          popup.closed = true;
          popup.props?.onClose?.();
          dispose();
          container.remove();
        }
      };
      fake.popup = popup;
      const dispose = render(factory, container);
    }
  };
});

// * imported once: a module loaded again would bring its own Solid, which the stand-ins here do not follow
import * as controller from '@components/wallet/tonConnect';

/** promises a test left unsettled: settled after it, so its flow does not hold the tab for the next one */
const unsettled: (() => void)[] = [];

/** a promise the test settles */
function deferred<T = void>() {
  let resolve: (value: T) => void, reject: (err: any) => void;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  unsettled.push(() => reject(new Error('left')));
  return {promise, resolve, reject};
}

/** lets the flow's promises run, and the clock on by `ms` */
async function tick(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
  for(let i = 0; i < 10; ++i) await Promise.resolve();
}

const envelope = (msgId: number, expires: number) => ({_: 'tonConnectRequest', session_id: '77', msg_id: msgId, body: new Uint8Array(), expires});

/** the server's pending request `msgId`; others are gone */
function serveRequest(msgId: number, expires: number) {
  fake.lib.findTonConnectRequest.mockImplementation(async(lookup: {msgId: number}) => {
    return lookup.msgId === msgId ? {session: fake.session, envelope: envelope(msgId, expires)} : undefined;
  });
  fake.lib.openTonConnectRequest.mockImplementation(async(_status: unknown, session: unknown, opened: any) => ({
    session,
    envelope: opened,
    request: {kind: 'signData', id: '9', method: 'signData', json: {type: 'binary', bytes: 'AAEC'}, payload: {type: 'binary', bytes: new Uint8Array([0, 1, 2])}},
    info: {name: 'App', domain: 'app.example', url: 'https://app.example'},
    address: fake.status.state.address,
    operationId: 'ton-connect:77:' + msgId
  }));
}

const lookedUp = () => fake.lib.findTonConnectRequest.mock.calls.map(([lookup]) => lookup.msgId);
const signButton = () => document.querySelector<HTMLButtonElement>('button[data-lang-key="Wallet.Sign.Sign"]');
const arrive = (msgId: number, expires: number) => controller.queueTonConnectRequest({sessionId: '77', msgId, expires, accepted: false, declined: false});

beforeEach(() => {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'Date']});
  vi.setSystemTime(fake.NOW * 1000);
  fake.toasts.length = 0;
  fake.connect = undefined;
  fake.popup = undefined;
  fake.connected.mockReset();
  fake.rootScope.managers.timeManager.getServerTime.mockReset().mockImplementation(async() => fake.NOW);
  Object.values(fake.lib).forEach((mock) => mock.mockReset());
  fake.lib.checkTonConnectManifest.mockReturnValue({name: 'App', domain: 'app.example', url: 'https://app.example'});
  fake.walletSession.vault.isUnlocked.mockReturnValue(true);
  fake.walletSession.vault.unlockSilently.mockReset().mockResolvedValue(true);
  fake.rootScope.managers.appWalletManager.getTonConnectSessions.mockReset().mockResolvedValue([]);
  fake.disconnect.mockClear();
});

afterEach(async() => {
  unsettled.splice(0).forEach((settle) => settle());
  fake.popup?.hide();
  await tick();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('TON Connect request sheet', () => {
  it('keeps the sheet and the tab while an answer goes past the request\'s time, and says only how it ended', async() => {
    serveRequest(3, fake.NOW + 10);
    const answer = deferred<{approved: boolean}>();
    fake.lib.answerTonConnectRequest.mockReturnValue(answer.promise);
    controller.openTonConnectRequestMessage('77', 3, fake.NOW + 10);
    await tick();
    expect(signButton()).toBeTruthy();

    signButton().click();
    await tick();
    expect(fake.lib.answerTonConnectRequest).toHaveBeenCalledTimes(1);
    // * the decline waits too: one answer at a time
    expect(document.querySelector<HTMLButtonElement>('button[data-lang-key="Wallet.Request.Decline"]').disabled).toBe(true);

    // * another request arrives and the time runs out while the answer goes
    await arrive(4, fake.NOW + 300);
    await tick(15e3);
    expect(fake.toasts).not.toContain('Wallet.Request.Expired');
    expect(fake.popup.closed).toBe(false);
    expect(lookedUp()).toEqual([3]);

    answer.resolve({approved: true});
    await tick();
    expect(fake.toasts).toEqual(['Wallet.Sign.Done']);
    expect(fake.popup.closed).toBe(true);
    // * the tab is free once the outcome is known
    expect(lookedUp()).toEqual([3, 4]);
  });

  it('takes the sheet along with "expired" once an answer that did not go comes back past the time', async() => {
    serveRequest(3, fake.NOW + 10);
    const answer = deferred<never>();
    fake.lib.answerTonConnectRequest.mockReturnValue(answer.promise);
    controller.openTonConnectRequestMessage('77', 3, fake.NOW + 10);
    await tick();
    signButton().click();
    await tick(15e3);
    expect(fake.popup.closed).toBe(false);

    answer.reject(new Error('network'));
    await tick();
    expect(fake.toasts).toEqual(['failure:unavailable', 'Wallet.Request.Expired']);
    expect(fake.popup.closed).toBe(true);
  });

  it('holds the tab while an answer goes after its sheet was closed', async() => {
    serveRequest(3, fake.NOW + 300);
    const answer = deferred<{approved: boolean}>();
    fake.lib.answerTonConnectRequest.mockReturnValue(answer.promise);
    controller.openTonConnectRequestMessage('77', 3, fake.NOW + 300);
    await tick();
    signButton().click();
    await tick();
    fake.popup.hide();
    await arrive(4, fake.NOW + 300);
    await tick();
    expect(lookedUp()).toEqual([3]);

    answer.resolve({approved: true});
    await tick();
    expect(fake.toasts).toEqual(['Wallet.Sign.Done']);
    expect(lookedUp()).toEqual([3, 4]);
  });
});

describe('TON Connect on the wallet\'s opening', () => {
  it('queues the requests an active session still holds, skipping expired ones and sessions not open', async() => {
    const getPending = fake.rootScope.managers.appWalletManager.tonConnectGetPending;
    getPending.mockReset().mockImplementation(async({sessionId}) => ({
      session: {...fake.session, id: sessionId},
      requests: sessionId === '77' ? [envelope(5, fake.NOW + 300), envelope(6, fake.NOW - 1)] : [envelope(7, fake.NOW + 300)]
    }));
    fake.rootScope.managers.appWalletManager.getTonConnectSessions.mockResolvedValue([
      fake.session,
      {...fake.session, id: '78', pFlags: {closing: true}},
      {...fake.session, id: '79', pFlags: {pending: true}},
      {...fake.session, id: '80', pFlags: {closed: true}}
    ]);
    serveRequest(5, fake.NOW + 300);
    await controller.refreshTonConnect();
    await tick();

    expect(getPending.mock.calls.map(([lookup]: any) => lookup.sessionId)).toEqual(['77']);
    expect(lookedUp()).toEqual([5]);
    expect(signButton()).toBeTruthy();
    getPending.mockReset().mockImplementation(async() => ({session: fake.session}));
  });
});

describe('TON Connect connect sheet', () => {
  const LINK = 'tc://?v=2&id=' + 'ab'.repeat(32) + '&r=' + encodeURIComponent(JSON.stringify({
    manifestUrl: 'https://app.example/tonconnect-manifest.json',
    items: [{name: 'ton_addr'}]
  }));

  async function openAtQuestion() {
    fake.lib.createTonConnectSession.mockResolvedValue({
      ...fake.session,
      pFlags: {pending: true},
      manifest: {_: 'tonConnectManifest', url: 'https://app.example', name: 'App'}
    });
    controller.openTonConnectLink(LINK);
    await tick();
    expect(fake.connect.phase()).toBe('confirm');
  }

  it('never declines a connection whose approval is on its way, and holds the tab until it settled', async() => {
    await openAtQuestion();
    const approval = deferred();
    fake.lib.answerTonConnectConnect.mockReturnValue(approval.promise);
    const connecting = fake.connect.onConnect();
    await tick();
    // * Cancel, or the sheet closed any other way, while the approval goes
    fake.connect.onClose();
    serveRequest(4, fake.NOW + 300);
    await arrive(4, fake.NOW + 300);
    await tick();
    expect(fake.lib.answerTonConnectConnect).toHaveBeenCalledTimes(1);
    expect(lookedUp()).toEqual([]);

    approval.resolve();
    await connecting;
    await tick();
    expect(fake.lib.answerTonConnectConnect).toHaveBeenCalledTimes(1);
    expect(fake.lib.answerTonConnectConnect.mock.calls[0][0].approve).toBe(true);
    expect(fake.connected).toHaveBeenCalledTimes(1);
    expect(lookedUp()).toEqual([4]);
  });

  it('declines a connection closed at the question, with the key at hand', async() => {
    await openAtQuestion();
    fake.lib.answerTonConnectConnect.mockResolvedValue(undefined);
    fake.connect.onClose();
    await tick();
    expect(fake.lib.answerTonConnectConnect).toHaveBeenCalledTimes(1);
    expect(fake.lib.answerTonConnectConnect.mock.calls[0][0].approve).toBe(false);
  });
});

describe('TON Connect sessions the server is closing', () => {
  const closeAsked = () => fake.rootScope.dispatchEvent('wallet_tonconnect_pending_disconnect', [fake.session.id]);

  it('closes one asked for while a sheet was up once the sheet goes, with the key at hand', async() => {
    fake.rootScope.managers.appWalletManager.getTonConnectSessions.mockResolvedValue([fake.session]);
    serveRequest(3, fake.NOW + 300);
    controller.openTonConnectRequestMessage('77', 3, fake.NOW + 300);
    await tick();
    expect(signButton()).toBeTruthy();

    closeAsked();
    await tick();
    expect(fake.disconnect).not.toHaveBeenCalled();

    fake.popup.hide();
    await tick();
    expect(fake.disconnect).toHaveBeenCalledTimes(1);
    expect(fake.disconnect.mock.calls[0][1]).toEqual([fake.session]);
  });

  it('asks nobody for the key: without it at hand, the closing waits', async() => {
    fake.rootScope.managers.appWalletManager.getTonConnectSessions.mockResolvedValue([fake.session]);
    fake.walletSession.vault.isUnlocked.mockReturnValue(false);
    fake.walletSession.vault.unlockSilently.mockResolvedValue(false);
    serveRequest(3, fake.NOW + 300);
    controller.openTonConnectRequestMessage('77', 3, fake.NOW + 300);
    await tick();
    closeAsked();
    fake.popup.hide();
    await tick();
    expect(fake.walletSession.vault.unlockSilently).toHaveBeenCalled();
    expect(fake.disconnect).not.toHaveBeenCalled();
  });
});

describe('TON Connect request times', () => {
  /** the device's clock `skew` seconds off the server's, which goes on with it */
  function skewClock(skew: number) {
    vi.setSystemTime((fake.NOW + skew) * 1000);
    fake.rootScope.managers.timeManager.getServerTime.mockImplementation(async() => (Date.now() / 1000 | 0) - skew);
  }

  it('reads them by the server\'s clock, not a device\'s that runs ahead', async() => {
    skewClock(600);
    serveRequest(3, fake.NOW + 60);
    await arrive(3, fake.NOW + 60);
    await tick();
    expect(lookedUp()).toEqual([3]);
    expect(signButton()).toBeTruthy();

    // * the sheet stays the minute the request has by the server's clock
    await tick(59e3);
    expect(fake.popup.closed).toBe(false);
    await tick(2e3);
    expect(fake.toasts).toEqual(['Wallet.Request.Expired']);
    expect(fake.popup.closed).toBe(true);
  });

  it('reads them by the server\'s clock, not a device\'s that runs behind', async() => {
    skewClock(-600);
    serveRequest(3, fake.NOW - 1);
    await arrive(3, fake.NOW - 1);
    await tick();
    expect(lookedUp()).toEqual([]);

    await controller.openTonConnectRequestMessage('77', 3, fake.NOW - 1);
    expect(fake.toasts).toEqual(['Wallet.Request.Expired']);
    expect(lookedUp()).toEqual([]);
  });

  it('drops a request that waited its turn past its time, by the server\'s clock', async() => {
    skewClock(-600);
    serveRequest(3, fake.NOW + 300);
    controller.openTonConnectRequestMessage('77', 3, fake.NOW + 300);
    await tick();
    await arrive(4, fake.NOW + 60);
    await tick(61e3);
    fake.popup.hide();
    await tick();
    expect(lookedUp()).toEqual([3]);
  });
});
