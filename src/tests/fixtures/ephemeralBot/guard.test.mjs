import {
  getJoinRequestRejectionReason,
  isUnanswerableQueryError,
  parseGuardConfig,
  processJoinRequest
} from './guard.mjs';

const config = {
  allowedChatIds: new Set(['-1001234567890']),
  result: 'approve',
  webAppUrl: undefined,
  webAppDelayMs: 0,
  webAppStartDelayMs: 0
};

const joinRequest = {
  chat: {id: -1001234567890},
  from: {id: 1000000001},
  query_id: '42'
};

describe('parseGuardConfig', () => {
  test('stays disabled without an allowlist', () => {
    expect(parseGuardConfig({chatIds: undefined})).toBeUndefined();
    expect(parseGuardConfig({chatIds: '  '})).toBeUndefined();
  });

  test('defaults to approving without a Mini App', () => {
    expect(parseGuardConfig({chatIds: '-1001'})).toEqual({
      allowedChatIds: new Set(['-1001']),
      result: 'approve',
      webAppUrl: undefined,
      webAppDelayMs: 8000,
      webAppStartDelayMs: 0
    });
  });

  test.each(['approve', 'decline', 'queue'])('accepts the %s result', (result) => {
    expect(parseGuardConfig({chatIds: '-1001', result}).result).toBe(result);
  });

  test('rejects an unknown result', () => {
    expect(() => parseGuardConfig({chatIds: '-1001', result: 'maybe'}))
    .toThrow(/TG_EPHEMERAL_BOT_GUARD_RESULT/);
  });

  test('requires the Mini App URL to be HTTPS', () => {
    expect(() => parseGuardConfig({chatIds: '-1001', webAppUrl: 'http://example.org'}))
    .toThrow(/HTTPS/);
    expect(parseGuardConfig({chatIds: '-1001', webAppUrl: 'https://a.org'}).webAppUrl)
    .toBe('https://a.org');
  });

  test('rejects a malformed chat ID', () => {
    expect(() => parseGuardConfig({chatIds: '-1001, nope'}))
    .toThrow(/Invalid Telegram chat ID/);
  });
});

describe('isUnanswerableQueryError', () => {
  // an expired or already-resolved query returns on every poll until the batch is acknowledged,
  // so treating it as fatal wedges the fixture on that one update forever
  test.each([
    'answerChatJoinRequestQuery: Bad Request: query is too old and response timeout expired or query ID is invalid',
    'sendChatJoinRequestWebApp: Bad Request: RESULT_INVALID'
  ])('recognises %s', (message) => {
    expect(isUnanswerableQueryError({errorCode: 400, message})).toBe(true);
  });

  test('does not excuse anything else', () => {
    expect(isUnanswerableQueryError({
      errorCode: 400,
      message: 'answerChatJoinRequestQuery: Bad Request: invalid query result specified'
    })).toBe(false);
    expect(isUnanswerableQueryError({errorCode: 403, message: 'query is too old'})).toBe(false);
    expect(isUnanswerableQueryError(undefined)).toBe(false);
  });
});

describe('getJoinRequestRejectionReason', () => {
  test('accepts an allowlisted guard query', () => {
    expect(getJoinRequestRejectionReason(joinRequest, config)).toBeUndefined();
  });

  test('ignores chats outside the allowlist', () => {
    expect(getJoinRequestRejectionReason({...joinRequest, chat: {id: -1}}, config))
    .toBe('chat-not-allowed');
  });

  // an ordinary "approve new members" request carries no query_id and belongs to the admins
  test('leaves a plain join request alone', () => {
    expect(getJoinRequestRejectionReason({...joinRequest, query_id: undefined}, config))
    .toBe('not-a-guard-query');
  });

  test('ignores a request without a sender', () => {
    expect(getJoinRequestRejectionReason({...joinRequest, from: undefined}, config))
    .toBe('sender-missing');
  });
});

describe('processJoinRequest', () => {
  const run = (overrides = {}) => {
    const answerJoinRequestQuery = vi.fn().mockResolvedValue(true);
    const sendJoinRequestWebApp = vi.fn().mockResolvedValue(true);
    const waited = [];
    const handledQueryIds = overrides.handledQueryIds || new Set();
    return {
      answerJoinRequestQuery,
      sendJoinRequestWebApp,
      waited,
      promise: processJoinRequest({
        joinRequest: overrides.joinRequest || joinRequest,
        config: overrides.config || config,
        handledQueryIds,
        answerJoinRequestQuery,
        sendJoinRequestWebApp,
        wait: (ms) => { waited.push(ms); return Promise.resolve(); }
      })
    };
  };

  test.each(['approve', 'decline', 'queue'])('answers with %s', async(result) => {
    const {answerJoinRequestQuery, promise} = run({config: {...config, result}});

    await expect(promise).resolves.toEqual({
      type: 'answered',
      result,
      webAppSent: false,
      userId: 1000000001
    });
    expect(answerJoinRequestQuery).toHaveBeenCalledWith({
      chat_join_request_query_id: '42',
      result
    });
  });

  test('shows the Mini App before resolving the query', async() => {
    const {answerJoinRequestQuery, sendJoinRequestWebApp, waited, promise} = run({
      config: {...config, webAppUrl: 'https://example.org/app', webAppDelayMs: 1234}
    });

    await expect(promise).resolves.toMatchObject({webAppSent: true, result: 'approve'});
    expect(sendJoinRequestWebApp).toHaveBeenCalledWith({
      chat_join_request_query_id: '42',
      web_app_url: 'https://example.org/app'
    });
    expect(waited).toEqual([1234]);
    expect(sendJoinRequestWebApp.mock.invocationCallOrder[0])
    .toBeLessThan(answerJoinRequestQuery.mock.invocationCallOrder[0]);
  });

  // holding the app back lets the client open the query first, so the URL arrives as a decision
  test('can hold the Mini App back until the client has opened the query', async() => {
    const {sendJoinRequestWebApp, waited, promise} = run({
      config: {...config, webAppUrl: 'https://a.org', webAppStartDelayMs: 4000, webAppDelayMs: 500}
    });

    await expect(promise).resolves.toMatchObject({webAppSent: true});
    expect(waited).toEqual([4000, 500]);
    expect(sendJoinRequestWebApp).toHaveBeenCalledTimes(1);
  });

  // the same query is redelivered until getUpdates is acknowledged
  test('answers a query only once', async() => {
    const handledQueryIds = new Set();
    await run({handledQueryIds}).promise;
    const second = run({handledQueryIds});

    await expect(second.promise).resolves.toEqual({
      type: 'ignored',
      reason: 'already-answered'
    });
    expect(second.answerJoinRequestQuery).not.toHaveBeenCalled();
  });

  test('never answers outside the allowlist', async() => {
    const {answerJoinRequestQuery, promise} = run({
      joinRequest: {...joinRequest, chat: {id: -777}}
    });

    await expect(promise).resolves.toEqual({
      type: 'ignored',
      reason: 'chat-not-allowed'
    });
    expect(answerJoinRequestQuery).not.toHaveBeenCalled();
  });
});
