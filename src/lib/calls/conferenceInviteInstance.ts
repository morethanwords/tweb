/*
 * A ringing conference-call invitation. It is not a call yet: there is no
 * media, no key exchange and no server-side call object bound to this client —
 * only the invite service message that authorizes the join.
 *
 * tdesktop models this with the very same `Calls::Call` class it uses for
 * 1-on-1 calls, in "conference invite" mode (calls_call.h:125), so the incoming
 * call panel, the ringtone and the accept/decline buttons are shared. We do the
 * same with a small instance the call popup understands, instead of teaching
 * the whole P2P `CallInstance` to be inert.
 */

import EventListenerBase from '@helpers/eventListenerBase';
import CALL_STATE from '@lib/calls/callState';
import {logger} from '@lib/logger';

export type ConferenceInviteInstanceOptions = {
  interlocutorUserId: UserId,
  /** Server id of the invite service message — the join/decline authorization. */
  msgId: number,
  conferenceId: string,
  /** Everyone the invite mentions, inviter included, for the panel's userpics. */
  participants: PeerId[],
  onAccept: (instance: ConferenceInviteInstance) => Promise<void>,
  onDecline: (instance: ConferenceInviteInstance) => Promise<void>
};

export default class ConferenceInviteInstance extends EventListenerBase<{
  state: (state: CALL_STATE) => void
}> {
  public readonly isOutgoing = false;
  public readonly wasTryingToJoin = false;
  public readonly connectedAt: number = undefined;
  public readonly duration = 0;

  public readonly interlocutorUserId: UserId;
  public readonly msgId: number;
  public readonly conferenceId: string;
  public readonly participants: PeerId[];

  private log: ReturnType<typeof logger>;
  private state: CALL_STATE;
  private onAccept: ConferenceInviteInstanceOptions['onAccept'];
  private onDecline: ConferenceInviteInstanceOptions['onDecline'];

  constructor(options: ConferenceInviteInstanceOptions) {
    super(false);

    this.interlocutorUserId = options.interlocutorUserId;
    this.msgId = options.msgId;
    this.conferenceId = options.conferenceId;
    this.participants = options.participants;
    this.onAccept = options.onAccept;
    this.onDecline = options.onDecline;

    this.log = logger('CONFERENCE-INVITE-' + this.msgId);
    this.state = CALL_STATE.PENDING;
  }

  public get connectionState() {
    return this.state;
  }

  public get isClosing() {
    return this.state === CALL_STATE.CLOSED;
  }

  private setState(state: CALL_STATE) {
    if(this.state === state) {
      return;
    }

    this.state = state;
    this.dispatchEvent('state', state);
  }

  /**
   * Accept — tdesktop's `Call::acceptConferenceInvite` (calls_call.cpp:435):
   * move out of the ringing state first, then resolve the conference from the
   * invite message and join it. A failed join closes the invite instead of
   * leaving a panel that rings forever.
   */
  public async acceptCall() {
    if(this.state !== CALL_STATE.PENDING) {
      return;
    }

    this.setState(CALL_STATE.EXCHANGING_KEYS);

    try {
      await this.onAccept(this);
    } catch(err) {
      this.log.error('conference invite accept failed', err);
      throw err;
    } finally {
      this.close();
    }
  }

  /**
   * Decline — tdesktop's `Call::hangup` in invite mode (calls_call.cpp:1540):
   * declines every incoming invite of this conference, not just this message.
   */
  public async hangUp() {
    if(this.state === CALL_STATE.CLOSED) {
      return;
    }

    const wasPending = this.state === CALL_STATE.PENDING;
    this.close();

    if(wasPending) {
      await this.onDecline(this);
    }
  }

  /**
   * Retract the invite without declining it — the invite message was revoked,
   * the call moved on without us, or another call took over.
   */
  public close() {
    this.setState(CALL_STATE.CLOSED);
  }
}
