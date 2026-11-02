/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * What an address holds on the chain, as the provider's `getAddressInformation` reports it — the same read
 * the engine refreshes its own account with. Only the old wallets this device still keeps a key of are asked.
 */
export type WalletAddressFunds = {
  /** canonical base-10 nanograms */
  nanos: string,
  /** no transaction ever touched it: an empty one holds nothing worth its phrase */
  neverUsed: boolean
};

export const ADDRESS_INFORMATION_ENDPOINT = '/api/v2/getAddressInformation';

/** A non-negative integer the provider wrote as a string or as an exact number */
function parseNonNegative(value: unknown): string | undefined {
  if(typeof(value) === 'string') {
    return /^\d+$/.test(value) ? value.replace(/^0+(?=\d)/, '') : undefined;
  }

  if(typeof(value) === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
}

/**
 * Reads the provider's answer; anything that is not a well-formed successful answer is no answer at all.
 */
export function parseWalletAddressFunds(body: string): WalletAddressFunds | undefined {
  let json: any;
  try {
    json = JSON.parse(body);
  } catch(err) {
    return;
  }

  const result = json?.result;
  if(json?.ok !== true || !result || typeof(result) !== 'object') {
    return;
  }

  const nanos = parseNonNegative(result.balance);
  if(nanos === undefined) {
    return;
  }

  const lt = parseNonNegative(result.last_transaction_id?.lt);
  return {nanos, neverUsed: lt === '0'};
}

export const JSON_RPC_ENDPOINT = '/api/v2/jsonRPC';

/** asks a wallet contract for its current signing key, the way the engine asks for the seqno */
export function makeSigningKeyRequestPayload(address: string) {
  return JSON.stringify({id: 1, jsonrpc: '2.0', method: 'runGetMethod', params: {address, method: 'get_public_key', stack: []}});
}

/**
 * The signing key a wallet contract holds now (`get_public_key`), as 64 lowercase hex digits; nothing for any other
 * answer — a contract not deployed, a failed getter, a malformed body
 */
export function parseWalletSigningKey(body: string): string | undefined {
  let json: any;
  try {
    json = JSON.parse(body);
  } catch(err) {
    return;
  }

  const result = json?.result;
  if(json?.ok === false || !result || typeof(result) !== 'object' || result.exit_code !== 0) {
    return;
  }

  const item = Array.isArray(result.stack) && result.stack.length === 1 ? result.stack[0] : undefined;
  const value = Array.isArray(item) && item[0] === 'num' && typeof(item[1]) === 'string' ? item[1] : undefined;
  const match = value && /^0x([0-9a-f]{1,64})$/i.exec(value);
  return match ? match[1].toLowerCase().padStart(64, '0') : undefined;
}
