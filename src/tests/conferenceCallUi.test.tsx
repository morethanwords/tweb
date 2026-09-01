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

import ListenerSetter from '@helpers/listenerSetter';
import I18n from '@lib/langPack';
import makeButton, {setCallButtonBusy, setCallButtonDisabled} from '@components/call/button';
import FingerprintBadge from '@components/conferenceCall/fingerprintBadge';
import {
  getMicrophoneControlAccessibility,
  performMicrophoneControlAction
} from '@components/groupCall/microphoneControl';
import GroupCallTitleElement from '@components/groupCall/title';
import wrapCallBubble from '@components/wrappers/callBubble';
import {MESSAGE_ID_OFFSET} from '@appManagers/constants';

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
      mid: 456
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

  it('carries the invite message id a conference bubble is joined by', () => {
    const conference = wrapCallBubble({
      action: {_: 'messageActionConferenceCall', pFlags: {}, call_id: '7'} as any,
      isOut: false,
      mid: MESSAGE_ID_OFFSET + 456
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
      mid: MESSAGE_ID_OFFSET + 456
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
