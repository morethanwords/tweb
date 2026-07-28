import {describe, expect, it} from 'vitest';
import resolveEphemeralCommand, {
  EphemeralCommandCandidate
} from '@appManagers/utils/bots/resolveEphemeralCommand';

const BOT_ONE = 100 as UserId;
const BOT_TWO = 101 as UserId;

function makeCandidate(
  botId: UserId,
  username: string,
  ephemeral: boolean,
  available = true
): EphemeralCommandCandidate {
  return {
    botId,
    username,
    available,
    commands: [{
      _: 'botCommand',
      pFlags: ephemeral ? {ephemeral: true} : {},
      command: 'secret',
      description: 'Secret'
    }]
  };
}

describe('resolveEphemeralCommand', () => {
  it('resolves a unique ephemeral command', () => {
    expect(resolveEphemeralCommand('/secret payload', [
      makeCandidate(BOT_ONE, 'first_bot', true)
    ])).toEqual({state: 'resolved', receiverId: BOT_ONE});
  });

  it('uses an explicit username when multiple bots expose the command', () => {
    expect(resolveEphemeralCommand('/secret@second_bot payload', [
      makeCandidate(BOT_ONE, 'first_bot', true),
      makeCandidate(BOT_TWO, 'second_bot', true)
    ])).toEqual({state: 'resolved', receiverId: BOT_TWO});
  });

  it('fails closed when an unqualified command has multiple receivers', () => {
    expect(resolveEphemeralCommand('/secret payload', [
      makeCandidate(BOT_ONE, 'first_bot', true),
      makeCandidate(BOT_TWO, 'second_bot', false)
    ])).toEqual({state: 'ambiguous'});
  });

  it('fails closed when the ephemeral receiver is not cached', () => {
    expect(resolveEphemeralCommand('/secret payload', [
      makeCandidate(BOT_ONE, 'first_bot', true, false)
    ])).toEqual({state: 'unavailable'});
  });

  it('deduplicates command sources for the same bot', () => {
    const candidate = makeCandidate(BOT_ONE, 'first_bot', true);
    expect(resolveEphemeralCommand('/secret payload', [
      candidate,
      {...candidate}
    ])).toEqual({state: 'resolved', receiverId: BOT_ONE});
  });

  it('keeps a known unavailable state when another source does not know it', () => {
    const unavailable = makeCandidate(BOT_ONE, 'first_bot', true, false);
    expect(resolveEphemeralCommand('/secret payload', [
      unavailable,
      {...unavailable, available: undefined}
    ])).toEqual({state: 'unavailable'});
  });

  it('leaves ordinary and unknown commands untouched', () => {
    expect(resolveEphemeralCommand('/secret payload', [
      makeCandidate(BOT_ONE, 'first_bot', false)
    ])).toEqual({state: 'none'});
    expect(resolveEphemeralCommand('/other payload', [
      makeCandidate(BOT_ONE, 'first_bot', true)
    ])).toEqual({state: 'none'});
  });
});
