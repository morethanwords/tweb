import {describe, expect, it, vi} from 'vitest';
import mergeEphemeralHistoryForRender from '@components/chat/mergeEphemeralHistoryForRender';

describe('mergeEphemeralHistoryForRender', () => {
  it('adds the overlay to the same history array before rendering', async() => {
    const regular = {mid: 1};
    const ephemeral = {mid: 2, ephemeralId: 2};
    const history: Array<typeof regular | typeof ephemeral> = [regular];
    const load = vi.fn(async() => [ephemeral]);

    const result = await mergeEphemeralHistoryForRender(history, true, load);

    expect(load).toHaveBeenCalledOnce();
    expect(result).toEqual([ephemeral]);
    expect(history).toEqual([regular, ephemeral]);
  });

  it('leaves a history window without its bottom edge unchanged', async() => {
    const regular = {mid: 1};
    const history = [regular];
    const load = vi.fn(async() => [{mid: 2, ephemeralId: 2}]);

    const result = await mergeEphemeralHistoryForRender(history, false, load);

    expect(load).not.toHaveBeenCalled();
    expect(result).toEqual([]);
    expect(history).toEqual([regular]);
  });
});
