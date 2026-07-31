import {describe, expect, it, vi} from 'vitest';
import {
  BotApiError,
  getPollRetryDelay,
  isRetryablePollError,
  processUpdateBatch,
  UpdateHandlingError
} from './polling.mjs';

describe('ephemeral bot polling errors', () => {
  it('retries only network, timeout, rate-limit, and server errors', () => {
    expect(isRetryablePollError(new TypeError('fetch failed'))).toBe(true);
    expect(isRetryablePollError(
      new BotApiError('getUpdates', {error_code: 408}, 408)
    )).toBe(true);
    expect(isRetryablePollError(
      new BotApiError('getUpdates', {error_code: 429}, 429)
    )).toBe(true);
    expect(isRetryablePollError(
      new BotApiError('getUpdates', {error_code: 502}, 502)
    )).toBe(true);

    expect(isRetryablePollError(
      new BotApiError('getUpdates', {error_code: 401}, 401)
    )).toBe(false);
    expect(isRetryablePollError(
      new BotApiError('getUpdates', {error_code: 409}, 409)
    )).toBe(false);
    expect(isRetryablePollError({name: 'AbortError'})).toBe(false);
  });

  it('honors bounded Bot API retry_after values', () => {
    expect(getPollRetryDelay(new TypeError('fetch failed'))).toBe(1000);
    expect(getPollRetryDelay(new BotApiError(
      'getUpdates',
      {
        error_code: 429,
        parameters: {retry_after: 12}
      },
      429
    ))).toBe(12000);
    expect(getPollRetryDelay(new BotApiError(
      'getUpdates',
      {
        error_code: 429,
        parameters: {retry_after: 120}
      },
      429
    ))).toBe(30000);
  });
});

describe('ephemeral bot update batch processing', () => {
  it('commits each offset only after its update succeeds', async() => {
    const offsets = [];
    const handleUpdate = vi.fn(async(update) => {
      if(update.update_id === 11) {
        throw new Error('temporary send failure');
      }
    });

    await expect(processUpdateBatch(
      [{update_id: 10}, {update_id: 11}, {update_id: 12}],
      {
        handleUpdate,
        isStopping: () => false,
        onOffset: (offset) => offsets.push(offset)
      }
    )).rejects.toMatchObject({
      name: 'UpdateHandlingError',
      updateId: 11,
      cause: expect.objectContaining({
        message: 'temporary send failure'
      })
    });

    expect(handleUpdate).toHaveBeenCalledTimes(2);
    expect(offsets).toEqual([11]);
  });

  it('does not start another update after shutdown is requested', async() => {
    let stopping = false;
    const offsets = [];
    const handleUpdate = vi.fn(async() => {
      stopping = true;
    });

    await processUpdateBatch(
      [{update_id: 20}, {update_id: 21}],
      {
        handleUpdate,
        isStopping: () => stopping,
        onOffset: (offset) => offsets.push(offset)
      }
    );

    expect(handleUpdate).toHaveBeenCalledTimes(1);
    expect(offsets).toEqual([21]);
  });

  it('preserves the original error as the failure cause', () => {
    const cause = new Error('send failed');
    const error = new UpdateHandlingError(30, cause);

    expect(error.updateId).toBe(30);
    expect(error.cause).toBe(cause);
  });
});
