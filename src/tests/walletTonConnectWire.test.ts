/*
 * TON Connect on the wire: links (iOS TonConnectLink, tdesktop ParseTonConnectLink), connect requests, a dApp's
 * requests read against the wallet (wallet-engine `decode_transaction_request`, `SignDataPayload`), the proof
 * domain guard (tdesktop TonConnectProofDomainAllowed) and the packets the wallet answers with.
 */

import {describe, expect, it} from 'vitest';
import {
  buildConnectErrorEvent,
  buildConnectEvent,
  buildDisconnectEvent,
  buildErrorResponse,
  buildSignDataResult,
  buildSuccessResponse,
  decodeTonConnectStartParam,
  getTonConnectDomain,
  getTonConnectHost,
  isTonConnectProofDomainAllowed,
  isTonConnectUrl,
  parseAppRequest,
  parseConnectRequest,
  parseTonConnectUrl,
  sumTonConnectAmounts,
  toRawTonAddress,
  TonConnectErrorCode
} from '@lib/wallet/tonConnectWire';
import {formatTonAddress} from '@lib/wallet/tonAddress';

const ID = '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a';
const REQUEST = JSON.stringify({
  manifestUrl: 'https://app.example/tonconnect-manifest.json',
  items: [{name: 'ton_addr'}, {name: 'ton_proof', payload: 'challenge-1'}]
});

/** how the TON Connect SDK squeezes a query into a start parameter (tdesktop TonConnectStartParam) */
function startParam(query: {[key: string]: string}) {
  const encode = (value: string) => encodeURIComponent(value).replace(/[-._~!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase());
  const joined = Object.entries(query).map(([key, value]) => key + '=' + encode(value)).join('-');
  return 'tonconnect-' + joined.replace(/=/g, '__').replace(/%/g, '--');
}

const query = (fields: {[key: string]: string}) => new URLSearchParams(fields).toString();

describe('TON Connect links', () => {
  it('reads a connect link in every form it comes in', () => {
    const fields = {v: '2', id: ID, r: REQUEST, ret: 'none'};
    for(const url of [
      'tc://?' + query(fields),
      'tg://ton-connect?' + query(fields),
      'https://t.me/sendgrams?' + query(fields),
      'tg://sendgrams?' + query(fields),
      'https://t.me/sendgrams?startapp=' + startParam(fields),
      'tg://resolve?domain=sendgrams&startapp=' + startParam(fields)
    ]) {
      expect(isTonConnectUrl(url), url).toBe(true);
      const link = parseTonConnectUrl(url);
      expect(link, url).toBeTruthy();
      expect(link.clientId).toBe(ID);
      expect(link.ret).toBe('none');
      expect(link.request).toEqual({
        manifestUrl: 'https://app.example/tonconnect-manifest.json',
        items: ['ton_addr', 'ton_proof'],
        proofPayload: 'challenge-1'
      });
    }
  });

  it('decodes a start parameter in the SDK order: "--" first, then "__", then "-"', () => {
    expect(decodeTonConnectStartParam('tonconnect-v__2-id__ab-trace_id__--2D')).toBe('v=2&id=ab&trace_id=%2D');
    expect(decodeTonConnectStartParam('other')).toBeUndefined();
  });

  it('reads a wake-up link: an id and a trace id, no request', () => {
    const traceId = '0190c5ef-1234-7abc-8def-0123456789ab';
    const link = parseTonConnectUrl('https://t.me/sendgrams?startapp=' + startParam({id: ID.toUpperCase(), trace_id: traceId}));
    expect(link).toEqual({clientId: ID, traceId, ret: undefined});
  });

  it('refuses malformed links, which are still TON Connect ones', () => {
    for(const url of [
      'tc://?v=2&id=' + ID.slice(1) + '&r=' + encodeURIComponent(REQUEST),
      'tc://?v=3&id=' + ID,
      'tc://?id=' + ID + '&r=' + encodeURIComponent(REQUEST),
      'tc://?v=2&id=' + ID + '&r=',
      'tc://?v=2&id=' + ID + '&id=' + ID,
      'tc://?v=2&id=' + ID + '&trace_id=' + 'a'.repeat(101),
      'tc://?v=2&id=' + ID + '#fragment',
      'https://t.me/sendgrams?id=' + ID + '&startapp=' + startParam({id: ID}),
      'https://t.me/sendgrams?startapp=' + startParam({id: ID}) + '&startapp=' + startParam({id: ID}),
      'tc://?v=2&id=' + ID + '&r=' + encodeURIComponent('{"manifestUrl":"http://app.example/m.json","items":[{"name":"ton_addr"}]}')
    ]) {
      expect(isTonConnectUrl(url), url).toBe(true);
      expect(parseTonConnectUrl(url), url).toBeUndefined();
    }
  });

  it('leaves the wallet\'s payment links and other start parameters alone', () => {
    expect(isTonConnectUrl('https://t.me/sendgrams?to=@durov&amount=1')).toBe(false);
    expect(isTonConnectUrl('tg://sendgrams?to=UQAA')).toBe(false);
    expect(isTonConnectUrl('tg://resolve?domain=durov&startapp=' + startParam({id: ID}))).toBe(false);
    expect(isTonConnectUrl('tg://resolve?domain=sendgrams&startapp=other')).toBe(false);
    expect(isTonConnectUrl('https://t.me/durov?startapp=' + startParam({id: ID}))).toBe(false);
    expect(isTonConnectUrl('not a url')).toBe(false);
  });
});

describe('TON Connect connect requests', () => {
  it('reads the items and the network', () => {
    expect(parseConnectRequest('{"manifestUrl":"https://a.example/m.json","items":[{"name":"ton_addr","network":"-239"}]}')).toEqual({
      manifestUrl: 'https://a.example/m.json',
      items: ['ton_addr'],
      network: '-239'
    });
  });

  it('refuses what iOS refuses', () => {
    for(const json of [
      '{"manifestUrl":"https://a.example/m.json","items":[]}',
      '{"manifestUrl":"https://a.example/m.json","items":[{"name":"ton_proof","payload":"x"}]}',
      '{"manifestUrl":"https://a.example/m.json","items":[{"name":"ton_addr"},{"name":"ton_addr"}]}',
      '{"manifestUrl":"https://a.example/m.json","items":[{"name":"ton_addr"},{"name":"something_else"}]}',
      '{"manifestUrl":"https://a.example/m.json","items":[{"name":"ton_addr","network":"mainnet"}]}',
      '{"manifestUrl":"https://a.example/m.json","items":[{"name":"ton_addr"},{"name":"ton_proof"}]}',
      '{"manifestUrl":"https://a.example/m.json","items":[{"name":"ton_addr"}],"extra":1}',
      '{"manifestUrl":"https://a.example/m.json","manifestUrl":"https://b.example/m.json","items":[{"name":"ton_addr"}]}',
      '{"manifestUrl":"https://user@a.example/m.json","items":[{"name":"ton_addr"}]}',
      '[]',
      'not json'
    ]) {
      expect(() => parseConnectRequest(json), json).toThrow();
    }
  });
});

describe('TON Connect domains', () => {
  it('binds the manifest host, with a port that is not the default one', () => {
    expect(getTonConnectHost('https://App.Example./tonconnect.json')).toBe('app.example');
    expect(getTonConnectDomain('https://app.example:443/m.json')).toBe('app.example');
    expect(getTonConnectDomain('https://app.example:8443/m.json')).toBe('app.example:8443');
  });

  it('never gives a dApp a proof for telegram.org or the wallet-ownership domain', () => {
    expect(isTonConnectProofDomainAllowed('app.example', 'wallet.telegram.org')).toBe(true);
    expect(isTonConnectProofDomainAllowed('app.example')).toBe(true);
    expect(isTonConnectProofDomainAllowed('telegram.org')).toBe(false);
    expect(isTonConnectProofDomainAllowed('Telegram.ORG..', 'other.example')).toBe(false);
    expect(isTonConnectProofDomainAllowed('wallet.telegram.org', 'wallet.telegram.org')).toBe(false);
    expect(isTonConnectProofDomainAllowed('WALLET.telegram.org.', 'wallet.telegram.org')).toBe(false);
    expect(isTonConnectProofDomainAllowed('', 'wallet.telegram.org')).toBe(false);
  });
});

describe('TON Connect requests', () => {
  const ownHash = new Uint8Array(32).fill(0x11);
  const own = formatTonAddress({workchain: 0, hash: ownHash, bounceable: false});
  const destination = formatTonAddress({workchain: 0, hash: new Uint8Array(32).fill(0x22), bounceable: true});
  const destinationNonBounce = formatTonAddress({workchain: 0, hash: new Uint8Array(32).fill(0x22), bounceable: false});
  const context = {address: own, now: 1_800_000_000};
  const request = (method: string, params: unknown[], id: unknown = '7') => JSON.stringify({method, params, id});
  const send = (payload: object, id?: unknown) => parseAppRequest(request('sendTransaction', [JSON.stringify(payload)], id), context);

  it('reads a transfer: the destination\'s flag bounces, payload and StateInit stay as sent', () => {
    const parsed = send({
      valid_until: 1_800_000_300,
      network: '-239',
      from: toRawTonAddress(own),
      messages: [
        {address: destination, amount: '1000000000', payload: 'te6cckEBAQEADAAAFAAAAABIZWxsbyGVgYQo'},
        {address: destinationNonBounce, amount: '007', stateInit: 'te6cckEBAQEAAgAAAEysuc0='}
      ]
    });
    expect(parsed.kind).toBe('sendTransaction');
    if(parsed.kind !== 'sendTransaction') return;
    expect(parsed.validUntil).toBe(1_800_000_300);
    expect(parsed.messages.map((message) => [message.bounce, message.amount])).toEqual([[true, '1000000000'], [false, '7']]);
    expect(sumTonConnectAmounts(parsed.messages)).toBe('1000000007');
    expect(parsed.intent).toEqual({
      expiration: {kind: 'exact', unixTimestamp: 1_800_000_300},
      messages: [
        {destination, amount: {kind: 'exact', nanograms: '1000000000'}, body: {kind: 'rawPayload', boc: 'te6cckEBAQEADAAAFAAAAABIZWxsbyGVgYQo'}, bounce: true, stateInit: null},
        {destination: destinationNonBounce, amount: {kind: 'exact', nanograms: '7'}, body: {kind: 'empty'}, bounce: false, stateInit: 'te6cckEBAQEAAgAAAEysuc0='}
      ]
    });
  });

  it('answers what it cannot do with the engine\'s error codes', () => {
    const message = {address: destination, amount: '1'};
    const cases: [object, TonConnectErrorCode][] = [
      [{valid_until: 1_799_999_999, messages: [message]}, TonConnectErrorCode.BAD_REQUEST],
      // * the SDK's spelling of the deadline, never sent on the wire: refused rather than dropped
      [{validUntil: 1_799_999_999, messages: [message]}, TonConnectErrorCode.BAD_REQUEST],
      [{network: '-3', messages: [message]}, TonConnectErrorCode.BAD_REQUEST],
      [{from: toRawTonAddress(destination), messages: [message]}, TonConnectErrorCode.BAD_REQUEST],
      [{messages: []}, TonConnectErrorCode.BAD_REQUEST],
      [{messages: [{address: toRawTonAddress(destination), amount: '1'}]}, TonConnectErrorCode.BAD_REQUEST],
      [{messages: [{address: destination, amount: 1}]}, TonConnectErrorCode.BAD_REQUEST],
      [{messages: [{address: destination, amount: '-1'}]}, TonConnectErrorCode.BAD_REQUEST],
      [{messages: [{address: destination, amount: '1', payload: '***'}]}, TonConnectErrorCode.BAD_REQUEST],
      [{messages: [{...message, extra_currency: {100: '1'}}]}, TonConnectErrorCode.METHOD_NOT_SUPPORTED],
      [{messages: new Array(256).fill(message)}, TonConnectErrorCode.METHOD_NOT_SUPPORTED],
      [{items: [], messages: [message]}, TonConnectErrorCode.METHOD_NOT_SUPPORTED]
    ];
    for(const [payload, code] of cases) {
      const parsed = send(payload);
      expect(parsed.kind, JSON.stringify(payload)).toBe('invalid');
      expect(parsed.kind === 'invalid' && parsed.code, JSON.stringify(payload)).toBe(code);
      expect(parsed.id).toBe('7');
    }

    const method = parseAppRequest(request('signMessage', ['{}']), context);
    expect(method.kind === 'invalid' && method.code).toBe(TonConnectErrorCode.METHOD_NOT_SUPPORTED);
    const unknown = parseAppRequest(request('somethingNew', []), context);
    expect(unknown.kind === 'invalid' && unknown.code).toBe(TonConnectErrorCode.METHOD_NOT_SUPPORTED);
    const params = parseAppRequest(request('sendTransaction', ['{}', '{}']), context);
    expect(params.kind === 'invalid' && params.code).toBe(TonConnectErrorCode.BAD_REQUEST);
  });

  it('cannot answer a request without a usable id', () => {
    for(const id of [7, '', 'a'.repeat(101), 'line\nbreak', null]) {
      expect(() => send({messages: [{address: destination, amount: '1'}]}, id)).toThrow();
    }
  });

  it('reads signData text and binary, and refuses cells and other networks', () => {
    const text = parseAppRequest(request('signData', [JSON.stringify({type: 'text', text: 'Hello', network: '-239'})]), context);
    expect(text.kind === 'signData' && text.payload).toEqual({type: 'text', text: 'Hello'});
    const binary = parseAppRequest(request('signData', [JSON.stringify({type: 'binary', bytes: 'AAEC/f7/', from: own})]), context);
    expect(binary.kind === 'signData' && Array.from((binary.payload as {bytes: Uint8Array}).bytes)).toEqual([0, 1, 2, 253, 254, 255]);
    expect(binary.kind === 'signData' && binary.json).toEqual({type: 'binary', bytes: 'AAEC/f7/', network: undefined, from: own});

    const cell = parseAppRequest(request('signData', [JSON.stringify({type: 'cell', schema: 'x', cell: 'te6c'})]), context);
    expect(cell.kind === 'invalid' && cell.code).toBe(TonConnectErrorCode.METHOD_NOT_SUPPORTED);
    for(const payload of [{type: 'text', text: 'x', network: '-3'}, {type: 'binary', bytes: '!!'}, {type: 'other'}, {type: 'text'}]) {
      const parsed = parseAppRequest(request('signData', [JSON.stringify(payload)]), context);
      expect(parsed.kind === 'invalid' && parsed.code, JSON.stringify(payload)).toBe(TonConnectErrorCode.BAD_REQUEST);
    }
  });

  it('reads a dApp\'s disconnect', () => {
    expect(parseAppRequest(request('disconnect', []), context)).toEqual({id: '7', method: 'disconnect', kind: 'disconnect'});
  });
});

describe('TON Connect packets', () => {
  const account = {address: '0:' + '11'.repeat(32), network: '-239', walletStateInit: 'te6c', publicKey: 'ab'.repeat(32)};

  it('builds the connect event with a numeric id, the account and the proof', () => {
    const json = buildConnectEvent({
      eventId: '12',
      account,
      proof: {timestamp: 1_700_000_000, domain: 'app.example', payload: 'challenge-1', signature: 'c2ln'},
      appVersion: '2.2'
    });
    expect(json.startsWith('{"event":"connect","id":12,')).toBe(true);
    expect(JSON.parse(json)).toEqual({
      event: 'connect',
      id: 12,
      payload: {
        items: [
          {name: 'ton_addr', ...account},
          {name: 'ton_proof', proof: {timestamp: 1_700_000_000, domain: {lengthBytes: 11, value: 'app.example'}, payload: 'challenge-1', signature: 'c2ln'}}
        ],
        device: {
          platform: 'browser',
          appName: 'Telegram',
          appVersion: '2.2',
          maxProtocolVersion: 2,
          features: [
            {name: 'SendTransaction', maxMessages: 255, extraCurrencySupported: false},
            {name: 'SignData', types: ['text', 'binary']}
          ]
        }
      }
    });
    // * a 64-bit event id keeps its digits
    expect(buildDisconnectEvent('18446744073709551615')).toBe('{"event":"disconnect","id":18446744073709551615,"payload":{}}');
    expect(() => buildDisconnectEvent('-1')).toThrow();
  });

  it('builds errors and results', () => {
    expect(JSON.parse(buildConnectErrorEvent(3, TonConnectErrorCode.USER_DECLINED))).toEqual({
      event: 'connect_error', id: 3, payload: {code: 300, message: 'User declined the request'}
    });
    expect(JSON.parse(buildErrorResponse('7', TonConnectErrorCode.UNKNOWN_APP))).toEqual({error: {code: 100, message: 'Unknown app'}, id: '7'});
    expect(JSON.parse(buildSuccessResponse('7', 'te6c'))).toEqual({result: 'te6c', id: '7'});
    expect(JSON.parse(buildSuccessResponse('8', {}))).toEqual({result: {}, id: '8'});
  });

  it('echoes the signed payload with what the signature binds', () => {
    expect(buildSignDataResult({
      signature: 'c2ln',
      address: account.address,
      timestamp: 1_700_000_000,
      domain: 'app.example',
      json: {type: 'text', text: 'Hello', network: '-239', from: undefined}
    })).toEqual({
      signature: 'c2ln',
      address: account.address,
      timestamp: 1_700_000_000,
      domain: 'app.example',
      payload: {type: 'text', text: 'Hello', network: '-239'}
    });
  });
});
