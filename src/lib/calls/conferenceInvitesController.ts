/*
 * Incoming conference-call invitations.
 *
 * A conference invite arrives as a `messageActionConferenceCall` service
 * message in a private chat, and tdesktop treats it as a ringing incoming call
 * rather than as something you act on inside the chat: `History` shows the
 * invite (history.cpp:1507), `Calls::Instance` keeps a registry of every invite
 * message per conference (calls_instance.cpp:1052) and rings, declines or drops
 * it as the registry changes.
 *
 * This controller is the tweb counterpart of those `Instance::*ConferenceInvite*`
 * methods. It owns the registry and the ringing lifecycle; the popup is created
 * by whoever listens to the `instance` event, exactly like `CallsController`.
 */

import DEBUG, {MOUNT_CLASS_TO} from '@config/debug';
import IS_CONFERENCE_CALL_SUPPORTED from '@environment/conferenceCallSupport';
import IS_GROUP_CALL_SUPPORTED from '@environment/groupCallSupport';
import getCallAudioAsset from '@components/call/getAudioAsset';
import EventListenerBase from '@helpers/eventListenerBase';
import tsNow from '@helpers/tsNow';
import {Message} from '@layer';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import {FullMid, makeFullMid} from '@appManagers/utils/messages/fullMid';
import {AppManagers} from '@lib/managers';
import {logger} from '@lib/logger';
import rootScope from '@lib/rootScope';
import CALL_STATE from '@lib/calls/callState';
import callsController from '@lib/calls/callsController';
import ConferenceInviteInstance from '@lib/calls/conferenceInviteInstance';
import groupCallsController from '@lib/calls/groupCallsController';
import GROUP_CALL_STATE from '@lib/calls/groupCallState';
import {CALL_REQUEST_TIMEOUT} from '@lib/calls/constants';
import {getConferenceCallState} from '@lib/calls/helpers/conferenceCallAction';
import sameInputGroupCall from '@lib/calls/helpers/sameInputGroupCall';

type InviteEntry = {
  peerId: PeerId,
  /** Local (tweb) mid — the id `history_delete` and `message_edit` speak in. */
  mid: number,
  /** Server msg id — the id `phone.declineConferenceCallInvite` speaks in. */
  serverMsgId: number,
  conferenceId: string,
  fromId: PeerId,
  date: number,
  participants: PeerId[],
  isOutgoing: boolean
};

export class ConferenceInvitesController extends EventListenerBase<{
  instance: (instance: ConferenceInviteInstance) => void
}> {
  private log: ReturnType<typeof logger>;
  private managers: AppManagers;
  private audioAsset: ReturnType<typeof getCallAudioAsset>;

  /** Every known invite message, keyed by its full mid. */
  private invites: Map<FullMid, InviteEntry>;
  /** Incoming invite keys per conference — the unit decline works on. */
  private incoming: Map<string, Set<FullMid>>;
  /** The conference currently ringing, if any. */
  private ringing: Map<string, ConferenceInviteInstance>;

  public construct(managers: AppManagers) {
    this.managers = managers;
    this.log = logger('CONFERENCE-INVITES');
    this.invites = new Map();
    this.incoming = new Map();
    this.ringing = new Map();

    if(!IS_GROUP_CALL_SUPPORTED) {
      return;
    }

    this.audioAsset = getCallAudioAsset();

    rootScope.addEventListener('history_multiappend', (message) => {
      this.onMessage(message as Message.messageService, true);
    });

    rootScope.addEventListener('message_edit', ({message}) => {
      // The server edits the very same service message as the call moves on:
      // `active` once someone joins, `missed` when nobody did, a duration once
      // it ends. tdesktop rebuilds the media and drops the registration in
      // `HistoryItem::applyEdition` (history_item.cpp:2574).
      this.onMessage(message as Message.messageService, false);
    });

    rootScope.addEventListener('history_delete', ({peerId, msgs}) => {
      for(const mid of msgs) {
        this.unregister(makeFullMid(peerId, mid));
      }
    });

    // A call that starts while an invitation is ringing takes the device over,
    // so the invitation cannot stay pending — it is declined, the same way an
    // invitation that arrives during a call is (calls_instance.cpp:1193).
    callsController.addEventListener('instance', () => this.declineWhileBusy());
    groupCallsController.addEventListener('instance', () => this.declineWhileBusy());
  }

  private onMessage(message: Message.messageService, isNew: boolean) {
    const action = message?.action;
    if(action?._ !== 'messageActionConferenceCall') {
      return;
    }

    const key = makeFullMid(message);
    const conferenceId = '' + action.call_id;
    const isInvitation = getConferenceCallState(action) === 'invitation';

    // Anything but a pending invitation is no longer actionable: unregister it
    // and stop ringing for it.
    if(!isInvitation || !message.peerId.isUser()) {
      this.unregister(key);
      return;
    }

    const isOutgoing = !!message.pFlags.out;
    const entry: InviteEntry = {
      peerId: message.peerId,
      mid: message.mid,
      serverMsgId: getServerMessageId(message.mid),
      conferenceId,
      fromId: message.fromId,
      date: message.date,
      participants: this.getParticipants(message),
      isOutgoing
    };

    if(this.invites.has(key)) {
      return;
    }

    this.invites.set(key, entry);
    if(isOutgoing) {
      return;
    }

    let set = this.incoming.get(conferenceId);
    if(!set) {
      this.incoming.set(conferenceId, set = new Set<FullMid>());
    }
    set.add(key);

    if(isNew) {
      this.show(entry);
    }
  }

  private getParticipants(message: Message.messageService) {
    const action = message.action as {other_participants?: Parameters<typeof getPeerId>[0][]};
    const participants: PeerId[] = [];
    const add = (peerId: PeerId) => {
      if(peerId && peerId !== rootScope.myId && !participants.includes(peerId)) {
        participants.push(peerId);
      }
    };

    add(message.fromId);
    action.other_participants?.forEach((peer) => add(getPeerId(peer)));
    return participants;
  }

  private unregister(key: FullMid) {
    const entry = this.invites.get(key);
    if(!entry) {
      return;
    }

    this.invites.delete(key);

    const {conferenceId} = entry;
    const set = this.incoming.get(conferenceId);
    if(set) {
      set.delete(key);
      if(!set.size) {
        this.incoming.delete(conferenceId);

        // The last invite that could still be accepted is gone — the panel
        // must not keep ringing for it (calls_instance.cpp:1091).
        this.ringing.get(conferenceId)?.close();
      }
    }
  }

  private isBusy() {
    return callsController.isOtherCallActive();
  }

  private isInConference(conferenceId: string) {
    const groupCall = groupCallsController.groupCall;
    if(!groupCall || groupCall.state === GROUP_CALL_STATE.CLOSED) {
      return false;
    }

    const input = groupCall.toInputGroupCall();
    return !!input && sameInputGroupCall(input, {
      _: 'inputGroupCall',
      id: conferenceId,
      access_hash: ''
    });
  }

  /**
   * `Instance::showConferenceInvite` (calls_instance.cpp:1166): every reason
   * not to ring, in the same order — invited by ourselves, calls switched off
   * for this session, already in this very conference, busy with another call,
   * or the invitation is simply too old to still be live.
   */
  private show(entry: InviteEntry) {
    const {conferenceId} = entry;

    // Per-frame E2E needs RTCRtpScriptTransform. Without it the invitation
    // cannot be accepted at all, so stay silent rather than ring or decline on
    // the user's behalf — the bubble still explains what happened.
    if(!IS_CONFERENCE_CALL_SUPPORTED) {
      return;
    }

    if(entry.fromId === rootScope.myId) {
      this.log('ignoring a conference invitation from this very account', entry.serverMsgId);
      return;
    }

    if(this.ringing.has(conferenceId) || this.isInConference(conferenceId)) {
      return;
    }

    // `callsDisabledForSession()` (calls_instance.cpp:1177): the session's own
    // "accept calls on this device" switch. tdesktop reads a cached flag; here
    // it is one round trip, after which the invitation is checked again.
    void this.managers.appAccountManager.isCallRequestsDisabled().then((disabled) => {
      if(disabled) {
        this.log('ignoring a conference invitation: call requests are disabled for this session', entry.serverMsgId);
        return;
      }

      this.ring(entry);
    });
  }

  private ring(entry: InviteEntry) {
    const {conferenceId} = entry;

    // The round trip above may have outlived the invitation.
    if(
      !this.invites.has(makeFullMid(entry.peerId, entry.mid)) ||
      this.ringing.has(conferenceId) ||
      this.isInConference(conferenceId)
    ) {
      return;
    }

    if(this.isBusy()) {
      void this.declineIncoming(conferenceId);
      return;
    }

    // tdesktop stops offering an invitation older than the server's
    // `call_ring_timeout_ms` (calls_instance.cpp:1194); that value is not
    // plumbed into tweb, so the ringing window is the one the 1-on-1 path
    // already assumes.
    if((entry.date * 1000 + CALL_REQUEST_TIMEOUT) < tsNow()) {
      this.log('ignoring a conference invitation that is too old', entry.serverMsgId);
      void this.declineIncoming(conferenceId);
      return;
    }

    const instance = new ConferenceInviteInstance({
      interlocutorUserId: entry.fromId.toUserId(),
      msgId: entry.serverMsgId,
      conferenceId,
      participants: entry.participants,
      onAccept: (instance) => this.accept(instance),
      onDecline: (instance) => this.declineIncoming(instance.conferenceId)
    });

    this.ringing.set(conferenceId, instance);
    this.audioAsset.play({name: 'incoming', loop: true});

    instance.addEventListener('state', (state) => {
      if(state !== CALL_STATE.CLOSED) {
        return;
      }

      if(this.ringing.get(conferenceId) === instance) {
        this.ringing.delete(conferenceId);
      }

      if(!this.ringing.size) {
        this.audioAsset.stop();
      }
    });

    this.dispatchEvent('instance', instance);
  }

  private async accept(instance: ConferenceInviteInstance) {
    // The ringtone belongs to the invitation, not to the call being joined.
    this.audioAsset.stop();

    // Dynamic import: `appImManager` statically imports the call UI, so a
    // static import here would close a cycle. It owns the whole join policy —
    // support gate, dead-link toast, leaving whatever call is current — and
    // `confirmed` skips the "join this call?" prompt, which pressing Accept on
    // a ringing invitation has already answered.
    const {default: appImManager} = await import('@lib/appImManager');
    await appImManager.joinConference({
      _: 'inputGroupCallInviteMessage',
      msg_id: instance.msgId
    }, {confirmed: true});
  }

  /**
   * `Instance::declineIncomingConferenceInvites` (calls_instance.cpp:1099):
   * one conference can have been offered by several invite messages, and
   * declining the call declines all of them.
   */
  public async declineIncoming(conferenceId: string) {
    const set = this.incoming.get(conferenceId);
    const keys = set ? [...set] : [];

    this.ringing.get(conferenceId)?.close();

    for(const key of keys) {
      const entry = this.invites.get(key);
      this.unregister(key);
      if(!entry) {
        continue;
      }

      try {
        await this.managers.appCallsManager.declineConferenceCallInvite(entry.serverMsgId);
      } catch(err) {
        this.log.error('declineConferenceCallInvite failed', err, entry.serverMsgId);
      }
    }
  }

  private declineWhileBusy() {
    for(const [conferenceId, instance] of this.ringing) {
      if(instance.connectionState !== CALL_STATE.PENDING || this.isInConference(conferenceId)) {
        continue;
      }

      void this.declineIncoming(conferenceId);
    }
  }
}

const conferenceInvitesController = new ConferenceInvitesController();
DEBUG && (MOUNT_CLASS_TO.conferenceInvitesController = conferenceInvitesController);
export default conferenceInvitesController;
