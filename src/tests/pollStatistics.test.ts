import '@helpers/peerIdPolyfill';
import {canViewPollStatistics} from '@components/chat/bubbleParts/pollMessageContent/pollStatistics';
import {Message} from '@layer';

describe('poll statistics', () => {
  test('allows server-enabled forwarded polls only on regular message surfaces', () => {
    const forwardedPoll = {
      _: 'message',
      mid: 10,
      pFlags: {},
      fwd_from: {_: 'messageFwdHeader', date: 1},
      media: {
        _: 'messageMediaPoll',
        results: {pFlags: {can_view_stats: true}}
      }
    } as Message.message;

    expect(canViewPollStatistics(forwardedPoll)).toBe(true);
    expect(canViewPollStatistics(forwardedPoll, false)).toBe(false);
    expect(canViewPollStatistics({...forwardedPoll, pFlags: {is_scheduled: true}})).toBe(false);
    expect(canViewPollStatistics({...forwardedPoll, pFlags: {is_outgoing: true}})).toBe(false);
  });
});
