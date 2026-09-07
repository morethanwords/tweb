import {describe, expect, it} from 'vitest';
import '@helpers/peerIdPolyfill';
import {CallLogMessage, getCallLogDirection, groupCallLogMessages} from '@lib/calls/helpers/callLog';

const DAY = 86400;
// A fixed local noon, so "same calendar day" never straddles midnight in the
// runner's timezone.
const NOON = new Date(2026, 1, 3, 12, 0, 0).getTime() / 1000 | 0;

function phoneCall(options: {
  mid: number,
  peerId: number,
  out?: boolean,
  date?: number,
  duration?: number,
  reason?: 'phoneCallDiscardReasonMissed' | 'phoneCallDiscardReasonBusy' | 'phoneCallDiscardReasonHangup',
  video?: boolean
}): CallLogMessage {
  return {
    _: 'messageService',
    mid: options.mid,
    peerId: options.peerId as PeerId,
    date: options.date ?? NOON,
    pFlags: options.out ? {out: true} : {},
    action: {
      _: 'messageActionPhoneCall',
      call_id: '' + options.mid,
      duration: options.duration,
      reason: {_: options.reason ?? 'phoneCallDiscardReasonHangup'},
      pFlags: options.video ? {video: true} : {}
    }
  } as any;
}

function conferenceCall(options: {
  mid: number,
  peerId: number,
  out?: boolean,
  date?: number,
  missed?: boolean,
  active?: boolean
}): CallLogMessage {
  return {
    _: 'messageService',
    mid: options.mid,
    peerId: options.peerId as PeerId,
    date: options.date ?? NOON,
    pFlags: options.out ? {out: true} : {},
    action: {
      _: 'messageActionConferenceCall',
      call_id: '' + options.mid,
      pFlags: {
        missed: options.missed || undefined,
        active: options.active || undefined
      }
    }
  } as any;
}

describe('getCallLogDirection', () => {
  it('calls every outgoing call outgoing, whatever became of it', () => {
    expect(getCallLogDirection(phoneCall({mid: 1, peerId: 1, out: true, duration: 42}))).toBe('out');
    expect(getCallLogDirection(phoneCall({
      mid: 2,
      peerId: 1,
      out: true,
      reason: 'phoneCallDiscardReasonMissed'
    }))).toBe('out');
  });

  it('counts an unanswered or busy incoming call as missed', () => {
    expect(getCallLogDirection(phoneCall({
      mid: 1,
      peerId: 1,
      reason: 'phoneCallDiscardReasonMissed'
    }))).toBe('missed');
    expect(getCallLogDirection(phoneCall({
      mid: 2,
      peerId: 1,
      reason: 'phoneCallDiscardReasonBusy'
    }))).toBe('missed');
  });

  it('counts an incoming call that connected as incoming, whatever the reason says', () => {
    expect(getCallLogDirection(phoneCall({
      mid: 1,
      peerId: 1,
      duration: 10,
      reason: 'phoneCallDiscardReasonMissed'
    }))).toBe('in');
  });

  it('reads a conference call off its missed flag', () => {
    expect(getCallLogDirection(conferenceCall({mid: 1, peerId: 1, missed: true}))).toBe('missed');
    expect(getCallLogDirection(conferenceCall({mid: 2, peerId: 1, active: true}))).toBe('in');
    expect(getCallLogDirection(conferenceCall({mid: 3, peerId: 1}))).toBe('in');
    expect(getCallLogDirection(conferenceCall({mid: 4, peerId: 1, out: true, missed: true}))).toBe('out');
  });
});

describe('groupCallLogMessages', () => {
  it('collapses same peer, same direction, same day into one row', () => {
    const groups = groupCallLogMessages([
      phoneCall({mid: 3, peerId: 1}),
      phoneCall({mid: 2, peerId: 1}),
      phoneCall({mid: 1, peerId: 1})
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].mids).toEqual([3, 2, 1]);
    expect(groups[0].direction).toBe('in');
    expect(groups[0].date).toBe(NOON);
  });

  it('splits on a different peer, direction or day', () => {
    const groups = groupCallLogMessages([
      phoneCall({mid: 5, peerId: 1}),
      phoneCall({mid: 4, peerId: 2}),
      phoneCall({mid: 3, peerId: 2, out: true}),
      phoneCall({mid: 2, peerId: 2, out: true, date: NOON - DAY}),
      phoneCall({mid: 1, peerId: 2, out: true, date: NOON - DAY})
    ]);

    expect(groups.map((group) => group.mids)).toEqual([[5], [4], [3], [2, 1]]);
  });

  it('keeps non-adjacent runs with the same peer apart', () => {
    const groups = groupCallLogMessages([
      phoneCall({mid: 3, peerId: 1}),
      phoneCall({mid: 2, peerId: 2}),
      phoneCall({mid: 1, peerId: 1})
    ]);

    expect(groups.map((group) => group.mids)).toEqual([[3], [2], [1]]);
  });

  it('takes the media kind and the invite id from the newest call of the row', () => {
    const groups = groupCallLogMessages([
      conferenceCall({mid: 9, peerId: 1}),
      phoneCall({mid: 8, peerId: 1, video: true})
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].conferenceMsgId).toBe(9);
    expect(groups[0].video).toBe(false);

    const videoGroups = groupCallLogMessages([phoneCall({mid: 8, peerId: 1, video: true})]);
    expect(videoGroups[0].video).toBe(true);
    expect(videoGroups[0].conferenceMsgId).toBeUndefined();
  });

  it('gives every row an id that survives paging in older calls', () => {
    const firstPage = [phoneCall({mid: 3, peerId: 1}), phoneCall({mid: 2, peerId: 2})];
    const withSecondPage = [
      ...firstPage,
      // Extends the second row, and starts a third.
      phoneCall({mid: 1, peerId: 2}),
      phoneCall({mid: 0, peerId: 3})
    ];

    const before = groupCallLogMessages(firstPage).map((group) => group.id);
    const after = groupCallLogMessages(withSecondPage).map((group) => group.id);

    // The id names the NEWEST call of the row, which is what an older page
    // cannot change — so the rendered rows survive the reconcile untouched.
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after).toHaveLength(3);
  });
});
