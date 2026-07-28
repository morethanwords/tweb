import {describe, expect, it} from 'vitest';
import {Message} from '@layer';
import compareBubbleTimelineMessages from '@components/chat/compareBubbleTimelineMessages';

function makeMessage(
  mid: number,
  date: number,
  ephemeralOrder?: number
): Message.message {
  return {
    _: 'message',
    pFlags: ephemeralOrder === undefined ? {} : {ephemeral: true},
    id: mid,
    mid,
    date,
    message: '',
    peer_id: {_: 'peerChat', chat_id: 1},
    ephemeral_id: ephemeralOrder === undefined ? undefined : mid,
    ephemeral_receiver_id: ephemeralOrder === undefined ? undefined : 1 as UserId,
    ephemeral_order: ephemeralOrder
  } as Message.message;
}

describe('ephemeral bubble timeline order', () => {
  it('preserves the regular message id order even if dates are skewed', () => {
    const lowerMid = makeMessage(50, 101);
    const higherMid = makeMessage(100, 100);

    expect(compareBubbleTimelineMessages(lowerMid, higherMid)).toBeLessThan(0);
  });

  it('sorts by date before considering the local id namespace', () => {
    const olderEphemeral = makeMessage(0x20000010, 100, 1);
    const newerRegular = makeMessage(50, 101);

    expect(compareBubbleTimelineMessages(olderEphemeral, newerRegular)).toBeLessThan(0);
  });

  it('places ephemeral messages after regular messages at the same timestamp', () => {
    const regular = makeMessage(100, 100);
    const ephemeral = makeMessage(0x20000010, 100, 1);

    expect(compareBubbleTimelineMessages(regular, ephemeral)).toBeLessThan(0);
    expect(compareBubbleTimelineMessages(ephemeral, regular)).toBeGreaterThan(0);
  });

  it('keeps same-second ephemeral messages in stable arrival order', () => {
    const first = makeMessage(0x20000050, 100, 1);
    const second = makeMessage(0x20000001, 100, 2);

    expect(compareBubbleTimelineMessages(first, second)).toBeLessThan(0);
  });
});
