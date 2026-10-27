import {afterEach, describe, expect, it, vi} from 'vitest';
import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';

vi.hoisted(() => {
  class IntersectionObserverMock {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
    public takeRecords(): IntersectionObserverEntry[] { return []; }
  }

  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/webp;base64,';
  vi.stubGlobal('CSS', {supports: () => true});
  vi.stubGlobal('Worker', class Worker {});
});

vi.mock('@components/peerTitle', () => ({
  default: class PeerTitle {
    public element = document.createElement('span');
    public options: {peerId?: PeerId};

    constructor(options: {peerId?: PeerId} = {}) {
      this.options = options;
    }

    public update(options?: {peerId?: PeerId}) {
      if(options) this.options = options;
    }
  }
}));

vi.mock('@lib/richTextProcessor/wrapEmojiText', () => ({
  default: (text: string) => document.createTextNode(text)
}));

// The clock format follows the language pack, which no unit test loads — pin it
// so the status line can be asserted verbatim.
const CALL_TIME = '12:00';
vi.mock('@helpers/date', async(importOriginal) => ({
  ...(await importOriginal<typeof import('@helpers/date')>()),
  formatTime: () => {
    const element = document.createElement('time');
    element.textContent = CALL_TIME;
    return element;
  }
}));

// The participants row only needs to prove WHICH faces it asks for — painting
// them pulls in the avatar stack, which wants a worker and a session.
const stackedAvatars = vi.hoisted(() => ({render: vi.fn()}));
vi.mock('@components/stackedAvatars', () => ({
  default: class StackedAvatarsMock {
    public container = document.createElement('div');
    public render(peerIds: PeerId[]) {
      stackedAvatars.render(peerIds);
      return Promise.resolve([]);
    }
  }
}));

import I18n from '@lib/langPack';
import liteMode from '@helpers/liteMode';
import CallButton from '@components/call/button';
import FingerprintBadge from '@components/conferenceCall/fingerprintBadge';
import {emojiFingerprint} from '@lib/calls/e2e/emojiFingerprint';
import {
  GROUP_CALL_MICROPHONE_BUTTON_STATE,
  getGroupCallMicrophoneButtonState,
  getMicrophoneControlAccessibility,
  performMicrophoneControlAction,
  shouldCarryOutMicrophonePress
} from '@components/groupCall/microphoneControl';
import {UNMUTE_INTENT_TTL_MS} from '@lib/calls/constants';
import GroupCallTitleElement from '@components/groupCall/title';
import wrapCallBubble, {getConferenceCallParticipants} from '@components/wrappers/callBubble';
import {MESSAGE_ID_OFFSET} from '@appManagers/constants';

/** A fixed moment for the call bubbles' status line. Rendered as `CALL_TIME`. */
const CALL_DATE = 1757270400;

// The status line composes time + duration through a lang string, like every
// official client ("{time}, {duration}"). Nothing loads the pack in a unit test.
I18n.strings.set('Chat.CallMessage.TimeAndDuration', {
  _: 'langPackString',
  key: 'Chat.CallMessage.TimeAndDuration',
  value: '%1$@, %2$@'
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('conference call controls accessibility', () => {
  it('names a native button by the label under it', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onClick = vi.fn();
    const [label, setLabel] = createSignal<'Call.Mute' | 'VoipUnmute'>('Call.Mute');
    const dispose = render(() => (
      <CallButton class="test-call" label={label()} icon="close" noRipple onClick={onClick} />
    ), host);

    const button = host.querySelector('button');
    const text = host.querySelector('.call-button-text');
    expect(button.type).toBe('button');
    expect(button.classList).toContain('test-call-button');
    expect(text.id).not.toBe('');
    expect(button.getAttribute('aria-labelledby')).toBe(text.id);
    expect(text.textContent).toBe('Call.Mute');
    // a label that names the next action is not a toggle
    expect(button.hasAttribute('aria-pressed')).toBe(false);

    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);

    setLabel('VoipUnmute');
    expect(text.textContent).toBe('VoipUnmute');
    dispose();
  });

  it('keeps a pressed state and a fill apart from the classes ripple adds', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const [on, setOn] = createSignal(false);
    const dispose = render(() => (
      <CallButton class="test-call" label="Call.Camera" color="red" active={on()} pressed={on()} onClick={() => {}} />
    ), host);

    const button = host.querySelector('button');
    expect(button.classList).toContain('rp');
    expect(button.classList).toContain('test-call-button-red');
    expect(button.getAttribute('aria-pressed')).toBe('false');

    setOn(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.classList).toContain('active');
    expect(button.classList).toContain('rp');
    dispose();
  });

  it('cannot be pressed while busy and gets its own disabled state back', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onClick = vi.fn();
    const [disabled, setDisabled] = createSignal(true);
    const [busy, setBusy] = createSignal(false);
    const dispose = render(() => (
      <CallButton class="test-call" label="VoiceChat.Leave" noRipple disabled={disabled()} busy={busy()} onClick={onClick} />
    ), host);

    const container = host.firstElementChild;
    const button = host.querySelector('button');
    expect(button.disabled).toBe(true);
    expect(container.classList).toContain('btn-disabled');

    setBusy(true);
    setDisabled(false);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    button.click();
    expect(onClick).not.toHaveBeenCalled();

    setBusy(false);
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(container.classList).not.toContain('btn-disabled');
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('derives microphone action labels from the current participant', () => {
    // before the server lists us: what we joined with, never "Connecting..."
    expect(getMicrophoneControlAccessibility()).toEqual({
      disabled: false,
      label: 'VoipUnmute'
    });
    expect(getMicrophoneControlAccessibility(undefined, false)).toEqual({
      disabled: false,
      label: 'Call.Mute'
    });
    expect(getGroupCallMicrophoneButtonState()).toBe(GROUP_CALL_MICROPHONE_BUTTON_STATE.MUTED);
    expect(getMicrophoneControlAccessibility({
      pFlags: {can_self_unmute: true, muted: true}
    } as any)).toEqual({
      disabled: false,
      label: 'VoipUnmute'
    });
    expect(getMicrophoneControlAccessibility({
      pFlags: {can_self_unmute: true, muted: false}
    } as any)).toEqual({
      disabled: false,
      label: 'Call.Mute'
    });
    expect(getMicrophoneControlAccessibility({
      pFlags: {can_self_unmute: true, muted: false}
    } as any, true)).toEqual({
      disabled: false,
      label: 'VoipUnmute'
    });
    expect(getMicrophoneControlAccessibility({
      pFlags: {can_self_unmute: false}
    } as any)).toEqual({
      disabled: false,
      label: 'ConferenceCall.Controls.RaiseHand'
    });
    expect(getMicrophoneControlAccessibility({
      pFlags: {can_self_unmute: false},
      raise_hand_rating: '1'
    } as any)).toEqual({
      disabled: true,
      label: 'ConferenceCall.Controls.HandRaised'
    });
  });

  it('carries out a press made before we were listed only as what it asked for, while fresh', () => {
    const listed = {pFlags: {can_self_unmute: true, muted: true}} as any;
    const unmute = {muted: false, at: 1000};
    expect(shouldCarryOutMicrophonePress(unmute, listed, true, 2000)).toBe(true);
    // the microphone is already what was asked for: pressing again would undo it
    expect(shouldCarryOutMicrophonePress(unmute, listed, false, 2000)).toBe(false);
    // an old press must not open the microphone by surprise
    expect(shouldCarryOutMicrophonePress(unmute, listed, true, 1000 + UNMUTE_INTENT_TTL_MS)).toBe(false);
    // the label never offered to raise a hand
    expect(shouldCarryOutMicrophonePress(unmute, {pFlags: {}} as any, true, 2000)).toBe(false);
    expect(shouldCarryOutMicrophonePress({muted: true, at: 1000}, {pFlags: {can_self_unmute: true}} as any, false, 2000)).toBe(true);
  });

  it('guards a missing participant and propagates microphone failures', async() => {
    const missing = {
      participant: undefined as any,
      changeRaiseHand: vi.fn(),
      toggleMuted: vi.fn()
    };
    await expect(performMicrophoneControlAction(missing as any)).resolves.toBeUndefined();
    expect(missing.toggleMuted).not.toHaveBeenCalled();

    const error = new Error('permission denied');
    const muted = {
      participant: {pFlags: {can_self_unmute: true, muted: true}},
      changeRaiseHand: vi.fn(),
      toggleMuted: vi.fn().mockRejectedValue(error)
    };
    await expect(performMicrophoneControlAction(muted as any)).rejects.toBe(error);

    const restricted = {
      participant: {pFlags: {can_self_unmute: false}},
      changeRaiseHand: vi.fn().mockResolvedValue(undefined),
      toggleMuted: vi.fn()
    };
    await performMicrophoneControlAction(restricted as any);
    expect(restricted.changeRaiseHand).toHaveBeenCalledWith(true);
    expect(restricted.toggleMuted).not.toHaveBeenCalled();
  });
});

describe('conference verification and entry UI', () => {
  it('shows the key spinning until there is one, then its four emoji, and says so', () => {
    vi.spyOn(liteMode, 'isAvailable').mockReturnValue(true);
    const host = document.createElement('div');
    document.body.append(host);
    const [hash, setHash] = createSignal<Uint8Array>();
    const dispose = render(() => <FingerprintBadge emojiHash={hash()} />, host);

    const card = host.querySelector('.conference-encryption-card') as HTMLElement;
    const status = host.querySelector('.conference-encryption [role="status"]') as HTMLElement;
    expect(card.getAttribute('aria-label')).toBe('ConferenceEncryptedSyncing');
    expect(card.getAttribute('aria-busy')).toBe('true');
    expect(card.getAttribute('aria-expanded')).toBe('false');
    expect(card.classList.contains('is-syncing')).toBe(true);
    expect(host.querySelectorAll('.conference-encryption-reel')).toHaveLength(4);
    expect(status.textContent).toBe('ConferenceEncryptedSyncing');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');

    const emojiHash = new Uint8Array(32);
    setHash(emojiHash);
    const label = card.getAttribute('aria-label')!;
    expect(label).toBe('ConferenceEncrypted: ' + emojiFingerprint(emojiHash).join(' '));
    expect(status.textContent).toBe(label);
    expect(card.classList.contains('is-syncing')).toBe(false);
    expect(card.hasAttribute('aria-busy')).toBe(false);
    expect(host.querySelectorAll('.conference-encryption-reel')).toHaveLength(0);
    expect(host.querySelectorAll('.conference-encryption-emoji-value')).toHaveLength(4);
    dispose();
  });

  // a reel that cannot spin would stand still on four random emoji, which read as a key
  it('shows no emoji at all for a key on its way when animations are off', () => {
    vi.spyOn(liteMode, 'isAvailable').mockReturnValue(false);
    const host = document.createElement('div');
    document.body.append(host);
    const dispose = render(() => <FingerprintBadge />, host);

    expect(host.querySelectorAll('.conference-encryption-reel')).toHaveLength(0);
    expect(host.querySelectorAll('.conference-encryption-emoji-pending')).toHaveLength(4);
    expect(host.querySelector('.conference-encryption-card').textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    dispose();
  });

  it('titles a conference call bubble by its state, not by an inline action', () => {
    const wrap = (action: any, isOut?: boolean) => wrapCallBubble({
      action,
      isOut: !!isOut,
      mid: 456,
      date: CALL_DATE
    }).element;

    const invitation = wrap({_: 'messageActionConferenceCall', pFlags: {}, call_id: '7'});
    expect(invitation.querySelector('.bubble-call-title').textContent)
    .toBe('Chat.Service.ConferenceCall.Invitation');
    expect(invitation.querySelector('button')).toBeNull();
    expect(invitation.querySelector('.bubble-call-arrow-green')).not.toBeNull();

    const ongoing = wrap({_: 'messageActionConferenceCall', pFlags: {active: true}, call_id: '7'});
    expect(ongoing.querySelector('.bubble-call-title').textContent)
    .toBe('Chat.Service.ConferenceCall.Ongoing');

    const missed = wrap({_: 'messageActionConferenceCall', pFlags: {missed: true}, call_id: '7'});
    expect(missed.querySelector('.bubble-call-title').textContent)
    .toBe('Chat.Service.ConferenceCall.Missed');
    expect(missed.querySelector('.bubble-call-arrow-red')).not.toBeNull();

    const declined = wrap({_: 'messageActionConferenceCall', pFlags: {missed: true}, call_id: '7'}, true);
    expect(declined.querySelector('.bubble-call-title').textContent)
    .toBe('Chat.Service.ConferenceCall.Declined');

    const ended = wrap({_: 'messageActionConferenceCall', pFlags: {}, call_id: '7', duration: 65});
    expect(ended.querySelector('.bubble-call-title').textContent)
    .toBe('Chat.Service.ConferenceCall.Incoming');
    expect(ended.querySelector('.bubble-call-subtitle').textContent).toContain('Minutes');
  });

  it('leads the status line with the call time and adds the duration after it', () => {
    const status = (action: any) => wrapCallBubble({
      action,
      isOut: false,
      mid: 456,
      date: CALL_DATE
    }).element.querySelector('.bubble-call-status').textContent;

    // No `MessageRender.setTime` in sight: the time IS the status line, the way
    // tdesktop's `customInfoLayout` bubble prints it.
    expect(status({_: 'messageActionConferenceCall', pFlags: {missed: true}, call_id: '7'}))
    .toBe(CALL_TIME);

    const withDuration = status({_: 'messageActionConferenceCall', pFlags: {}, call_id: '7', duration: 65});
    expect(withDuration.startsWith(CALL_TIME + ', ')).toBe(true);
    expect(withDuration).toContain('Minutes');
  });

  it('says in the title how a 1-on-1 call ended, like every official client', () => {
    const title = (action: any, isOut?: boolean) => wrapCallBubble({
      action,
      isOut: !!isOut,
      mid: 456,
      date: CALL_DATE
    }).element.querySelector('.bubble-call-title').textContent;

    const call = (reason: string, video?: boolean) => ({
      _: 'messageActionPhoneCall',
      pFlags: video ? {video: true} : {},
      reason: {_: reason}
    });

    expect(title(call('phoneCallDiscardReasonHangup'))).toBe('CallMessageIncoming');
    expect(title(call('phoneCallDiscardReasonMissed'))).toBe('CallMessageIncomingMissed');
    expect(title(call('phoneCallDiscardReasonBusy'))).toBe('CallMessageIncomingDeclined');
    // Outgoing: nobody picked up means cancelled, and busy is not the caller's
    // verdict to report (tdesktop's MediaCall::Text keeps it on the outgoing key).
    expect(title(call('phoneCallDiscardReasonMissed'), true)).toBe('CallMessageOutgoingMissed');
    expect(title(call('phoneCallDiscardReasonBusy'), true)).toBe('CallMessageOutgoing');
    expect(title(call('phoneCallDiscardReasonMissed', true))).toBe('CallMessageVideoIncomingMissed');
    expect(title(call('phoneCallDiscardReasonBusy', true))).toBe('CallMessageVideoIncomingDeclined');
  });

  it('puts the people a conference was shared with on its status line', () => {
    stackedAvatars.render.mockClear();

    const action = {
      _: 'messageActionConferenceCall',
      pFlags: {missed: true},
      call_id: '7',
      // The author is named twice on purpose: Android dedupes the row into a
      // set, and the count under the faces follows the deduped list.
      other_participants: [{_: 'peerUser', user_id: 1}, {_: 'peerUser', user_id: 2}]
    } as any;

    expect(getConferenceCallParticipants(action, 1 as PeerId)).toEqual([1, 2]);

    const {element} = wrapCallBubble({
      action,
      isOut: false,
      mid: 456,
      date: CALL_DATE,
      fromId: 1 as PeerId,
      middleware: (() => true) as any
    });

    expect(stackedAvatars.render).toHaveBeenCalledWith([1, 2]);
    expect(element.querySelector('.bubble-call-participants-count')).not.toBeNull();
  });

  it('leaves the status line alone when a conference names no participants', () => {
    stackedAvatars.render.mockClear();

    const {element} = wrapCallBubble({
      action: {_: 'messageActionConferenceCall', pFlags: {}, call_id: '7'} as any,
      isOut: false,
      mid: 456,
      date: CALL_DATE,
      fromId: 1 as PeerId,
      middleware: (() => true) as any
    });

    expect(stackedAvatars.render).not.toHaveBeenCalled();
    expect(element.querySelector('.bubble-call-participants')).toBeNull();
  });

  it('carries the invite message id a conference bubble is joined by', () => {
    const conference = wrapCallBubble({
      action: {_: 'messageActionConferenceCall', pFlags: {}, call_id: '7'} as any,
      isOut: false,
      mid: MESSAGE_ID_OFFSET + 456,
      date: CALL_DATE
    }).element;

    // The click handler joins through inputGroupCallInviteMessage, which takes
    // the SERVER id — a tweb mid would resolve to nothing.
    expect(conference.dataset.conferenceMsgId).toBe('456');
    expect(conference.dataset.type).toBeUndefined();

    const phoneCall = wrapCallBubble({
      action: {
        _: 'messageActionPhoneCall',
        pFlags: {video: true},
        reason: {_: 'phoneCallDiscardReasonMissed'}
      } as any,
      isOut: false,
      mid: MESSAGE_ID_OFFSET + 456,
      date: CALL_DATE
    }).element;

    expect(phoneCall.dataset.conferenceMsgId).toBeUndefined();
    expect(phoneCall.dataset.type).toBe('video');
  });

  it('uses the localized title key for a chatless conference', () => {
    const title = document.createElement('div');
    const titleElement = new GroupCallTitleElement(title);
    titleElement.update({
      e2e: {},
      chatId: 0,
      groupCall: undefined
    } as any);

    expect(title.textContent).toBe('ConferenceCall.Title');
  });
});
