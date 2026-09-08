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

import ListenerSetter from '@helpers/listenerSetter';
import I18n from '@lib/langPack';
import makeButton, {setCallButtonBusy, setCallButtonDisabled} from '@components/call/button';
import FingerprintBadge from '@components/conferenceCall/fingerprintBadge';
import {
  getMicrophoneControlAccessibility,
  performMicrophoneControlAction
} from '@components/groupCall/microphoneControl';
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
});

describe('conference call controls accessibility', () => {
  it('builds a native named button and honours the disabled state', () => {
    const listenerSetter = new ListenerSetter();
    const callback = vi.fn();
    const element = makeButton('test-call', listenerSetter, {
      ariaLabel: 'VoiceChat.Leave',
      callback,
      noRipple: true
    });

    expect(element).toBeInstanceOf(HTMLButtonElement);
    const button = element as HTMLButtonElement;
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('VoiceChat.Leave');

    button.click();
    expect(callback).toHaveBeenCalledTimes(1);

    button.disabled = true;
    button.click();
    expect(callback).toHaveBeenCalledTimes(1);
    listenerSetter.removeAll();
  });

  it('disables the native button inside a labelled control while it is busy', () => {
    const listenerSetter = new ListenerSetter();
    const container = makeButton('test-call', listenerSetter, {
      text: 'VoiceChat.Leave',
      noRipple: true
    });
    const button = container.querySelector('button');
    const label = container.querySelector('.call-button-text');

    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect(label?.id).not.toBe('');
    expect(button?.getAttribute('aria-labelledby')).toBe(label?.id);

    setCallButtonBusy(container, true);
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute('aria-busy')).toBe('true');
    expect(container.classList).toContain('btn-disabled');

    setCallButtonBusy(container, false);
    expect(button?.disabled).toBe(false);
    expect(button?.hasAttribute('aria-busy')).toBe(false);
    listenerSetter.removeAll();
  });

  it('restores the independent disabled state after busy work finishes', () => {
    const listenerSetter = new ListenerSetter();
    const button = makeButton('test-call', listenerSetter, {
      disabled: true,
      noRipple: true
    }) as HTMLButtonElement;

    setCallButtonBusy(button, true);
    setCallButtonBusy(button, false);
    expect(button.disabled).toBe(true);
    expect(button.classList).toContain('btn-disabled');

    setCallButtonBusy(button, true);
    setCallButtonDisabled(button, false);
    expect(button.disabled).toBe(true);
    setCallButtonBusy(button, false);
    expect(button.disabled).toBe(false);
    expect(button.classList).not.toContain('btn-disabled');
    listenerSetter.removeAll();
  });

  it('derives microphone action labels from the current participant', () => {
    expect(getMicrophoneControlAccessibility()).toEqual({
      disabled: true,
      label: 'VoiceChat.Status.Connecting'
    });
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
  it('renders pending and verified fingerprints without a fake action', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const [hash, setHash] = createSignal<Uint8Array>();
    const dispose = render(() => <FingerprintBadge emojiHash={hash()} />, host);

    const badge = host.querySelector('.conference-fingerprint-badge') as HTMLElement;
    const status = host.querySelector('.conference-fingerprint') as HTMLElement;
    expect(badge).toBeInstanceOf(HTMLSpanElement);
    expect(host.querySelector('button')).toBeNull();
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-label')).toBe('ConferenceCall.Fingerprint.Pending');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');

    setHash(new Uint8Array(32));
    const renderedEmojis = Array.from(
      host.querySelectorAll('.conference-fingerprint-badge__emoji')
    ).map((element) => element.textContent!);
    const accessibleLabel = status.getAttribute('aria-label')!;
    expect(accessibleLabel).toContain('ConferenceCall.Fingerprint.Verified');
    expect(renderedEmojis).toHaveLength(4);
    renderedEmojis.forEach((emoji) => expect(accessibleLabel).toContain(emoji));
    expect(status.querySelector('.conference-fingerprint-badge__instruction')).toBeNull();
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
