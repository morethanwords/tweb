/*
 * Originally from:
 * https://github.com/evgeny-nadymov/telegram-react
 * Copyright (C) 2018 Evgeny Nadymov
 * https://github.com/evgeny-nadymov/telegram-react/blob/master/LICENSE
 */

import type GroupCallConnectionInstance from '@lib/calls/groupCallConnectionInstance';
import safeReplaceObject from '@helpers/object/safeReplaceObject';
import {nextRandomUint} from '@helpers/random';
import {DataJSON, GroupCall, GroupCallParticipant, GroupCallParticipantVideoSourceGroup, GroupCallStreamChannel, InputFileLocation, InputGroupCall, Peer, PhoneGroupCall, PhoneGroupParticipants, PhoneJoinGroupCall, PhoneJoinGroupCallPresentation, Update, Updates} from '@layer';
import {NULL_PEER_ID} from '@appManagers/constants';
import {AppManager} from '@appManagers/manager';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {DcId} from '@types';
import assumeType from '@helpers/assumeType';
import {parseVideoStreamInfo} from '@lib/calls/videoStreamInfo';
import sameInputGroupCall from '@lib/calls/helpers/sameInputGroupCall';
import {
  findResolvedGroupCallUpdate,
  getInputGroupCallFromUpdates,
  getUpdatesList,
  groupCallToInput
} from '@lib/calls/helpers/groupCallUpdates';
import {toTelegramSource} from '@lib/calls/utils';
import {CONFERENCE_PREVIEW_PARTICIPANTS_LIMIT, GROUP_CALL_PARTICIPANTS_LOAD_LIMIT} from '@lib/calls/constants';
import pause from '@helpers/schedulers/pause';

export type GroupCallId = GroupCall['id'];
export type MyGroupCall = GroupCall | Exclude<
  InputGroupCall,
  InputGroupCall.inputGroupCallSlug | InputGroupCall.inputGroupCallInviteMessage
>;

export type GroupCallConnectionType = 'main' | 'presentation';

export type JoinGroupCallJsonPayload = {
  fingerprints: {
    fingerprint: string;
    setup: string;
    hash: string;
  }[];
  pwd: string;
  ssrc: number;
  'ssrc-groups': GroupCallParticipantVideoSourceGroup.groupCallParticipantVideoSourceGroup[];
  ufrag: string;
};

// Upper bound on the conference-roster walk. Purely a stop against a server
// that keeps handing back a full page with a fresh cursor; a real conference
// never comes close.
const MAX_CONFERENCE_ROSTER_PAGES = 20;
// How many CALL_MIGRATE_x hops one RTMP stream-channels fetch may follow.
const MAX_RTMP_STATE_MIGRATIONS = 3;

// A `min` participant row is the server's non-personalised broadcast form: it
// carries no `muted_by_you` / `volume` / `volume_by_admin` for THIS viewer
// (tdlib GroupCallParticipant::update_from, tdesktop data_group_call.cpp
// applyParticipantsSlice keep was->mutedByMe / was->volume for is_min rows).
// Replacing the cached row wholesale reset a local "mute for me" and volume on
// every such broadcast. Everything else in a min row is authoritative.
function keepPersonalFieldsFromCachedParticipant(cached: GroupCallParticipant, min: GroupCallParticipant) {
  const {pFlags} = min;
  if(cached.pFlags.muted_by_you) pFlags.muted_by_you = true;
  else delete pFlags.muted_by_you;
  if(cached.pFlags.volume_by_admin) pFlags.volume_by_admin = true;
  else delete pFlags.volume_by_admin;
  // tdesktop applyVolumeFromMin: a volume an admin set is the one exception a
  // min row may carry, everything else keeps the value we chose locally.
  if(!cached.pFlags.volume_by_admin) {
    if(cached.volume !== undefined) min.volume = cached.volume;
    else delete min.volume;
  }
}

type NextOffsetSaveMode = 'skip' | 'initialize' | 'replace';

type ResolvedGroupCallConnection = Update.updateGroupCallConnection & {
  acceptedCallInput: InputGroupCall,
  resolvedCallId?: GroupCallId,
  resolvedAccessHash?: GroupCall.groupCall['access_hash'],
  resolvedGroupCall?: GroupCall.groupCall,
  resolvedChainUpdates?: Update.updateGroupCallChainBlocks[]
};

type MainGroupCallConnectionOptions = Extract<
  GroupCallConnectionInstance['options'],
  {type: 'main'}
>;

function getJoinSource(params: DataJSON): number {
  try {
    const source = (JSON.parse(params.data) as {ssrc?: unknown}).ssrc;
    return typeof(source) === 'number' && Number.isSafeInteger(source) ? source : 0;
  } catch{
    return 0;
  }
}

export type GroupCallOutputSource = 'main' | 'presentation' | number;

export interface GroupCallRtmpState {
  channels: GroupCallStreamChannel[];
  dcId: DcId;
  time: number;
}

export interface CallRecordParams {
  name: string;
  recordVideo: boolean;
  videoHorizontal: boolean;
}

/**
 * What one `refreshConferenceParticipants` fetch saw on the SFU. Handed back to
 * the tab so it can reconcile the roster against the e2e blockchain membership
 * without a second round-trip through the manager proxy (which could observe a
 * cache that already moved on).
 */
export interface ConferenceRosterSnapshot {
  /**
   * Whether this fetch covered the WHOLE roster. Only then does "absent from
   * the list" mean "not in the call" — on a truncated walk it just means "on a
   * page we did not receive", which must never drive removals.
   */
  complete: boolean;
  /**
   * Exact decimal `user_id`s the server listed, self included — not PeerIds.
   * The e2e chain identifies participants by int64 user_id, and PeerId is a JS
   * number, so diffing in PeerId space would let two distinct chain ids collide
   * above 2^53 and hide one behind the other. Non-user rows are skipped: they
   * can never correspond to a chain participant.
   */
  userIds: string[];
}

export class AppGroupCallsManager extends AppManager {
  private groupCalls: Map<GroupCallId, MyGroupCall>;
  private participants: Map<GroupCallId, Map<PeerId, GroupCallParticipant>>;
  private participantRevisions = new WeakMap<GroupCallParticipant, number>();
  private nextOffsets: Map<GroupCallId, string>;
  private participantFetchGenerations: Map<GroupCallId, number>;
  private participantVersions: Map<GroupCallId, number>;

  private cachedStreamChannels: Map<GroupCallId, Promise<GroupCallRtmpState>>;

  // In-flight de-dup for the conference roster walk. `invokeApiSingleProcess`'
  // bucket is keyed by (method, cacheKey) and can't span a multi-request walk,
  // so the guard lives here instead.
  private conferenceRosterFetches: Map<GroupCallId, Promise<ConferenceRosterSnapshot | false>>;

  // Single-flight heal after a version-gated participant drop (see
  // resyncParticipantsAfterDroppedUpdate).
  private participantsResyncs: Map<GroupCallId, Promise<void>>;

  protected after() {
    this.name = 'GROUP-CALLS';

    this.groupCalls = new Map<GroupCallId, MyGroupCall>();
    this.participants = new Map<GroupCallId, Map<PeerId, GroupCallParticipant>>();
    this.nextOffsets = new Map<GroupCallId, string>();
    this.participantFetchGenerations = new Map<GroupCallId, number>();
    this.participantVersions = new Map<GroupCallId, number>();

    this.cachedStreamChannels = new Map();
    this.conferenceRosterFetches = new Map();
    this.participantsResyncs = new Map();

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateGroupCall: (update) => {
        this.saveGroupCall(update.call, this.appPeersManager.getPeerId(update.peer));
      },

      updateGroupCallParticipants: (update) => this.processGroupCallParticipantsUpdate(update)
    });

    this.rootScope.addEventListener('group_call_update', (groupCall) => {
      if(groupCall._ === 'groupCallDiscarded') {
        this.participants.delete(groupCall.id);
      }
    });
  }

  public getCachedParticipants(groupCallId: GroupCallId) {
    let participants = this.participants.get(groupCallId);
    if(!participants) {
      this.participants.set(groupCallId, participants = new Map());
    }

    return participants;
  }

  private getParticipantFetchGeneration(groupCallId: GroupCallId): number {
    return this.participantFetchGenerations.get(groupCallId) || 0;
  }

  private isParticipantFetchGenerationCurrent(groupCallId: GroupCallId, generation: number): boolean {
    return this.getParticipantFetchGeneration(groupCallId) === generation;
  }

  private invalidateParticipantFetches(groupCallId: GroupCallId): void {
    this.participantFetchGenerations.set(
      groupCallId,
      this.getParticipantFetchGeneration(groupCallId) + 1
    );
    this.nextOffsets.delete(groupCallId);
    this.conferenceRosterFetches.delete(groupCallId);
  }

  private saveParticipantVersion(groupCallId: GroupCallId, version: number): void {
    if(!Number.isSafeInteger(version)) return;
    const current = this.participantVersions.get(groupCallId);
    if(current === undefined || version > current) {
      this.participantVersions.set(groupCallId, version);
    }
  }

  private isParticipantVersionOlder(groupCallId: GroupCallId, version: number): boolean {
    const current = this.participantVersions.get(groupCallId);
    return current !== undefined && Number.isSafeInteger(version) && version < current;
  }

  /**
   * A version-gated drop loses the dropped payload's participant rows (and
   * their SSRCs) with nothing re-delivering them: legacy voice chats have no
   * periodic roster poll, so a joiner whose push lost the ordering race would
   * stay invisible AND silent until a manual rejoin (no recv m-line is ever
   * built for them). tdlib schedules a full participants reload on any version
   * mismatch; this is the equivalent, bounded to one in-flight resync per call.
   *
   * Conferences are excluded: their rows are delivered by the 5s roster walk
   * (which self-heals), and their version cursor races constantly with it, so
   * resyncing on every gated push would only add RPC noise.
   */
  private resyncParticipantsAfterDroppedUpdate(id: GroupCallId): void {
    const groupCall = this.getGroupCall(id);
    if(!groupCall || groupCall._ !== 'groupCall' || groupCall.pFlags?.conference) return;
    const resyncs = this.participantsResyncs ??= new Map();
    if(resyncs.has(id)) return;

    const promise = (async() => {
      for(let attempt = 0; attempt < 2; ++attempt) {
        const generation = this.getParticipantFetchGeneration(id);
        let result: PhoneGroupParticipants;
        try {
          result = await this.apiManager.invokeApi('phone.getGroupParticipants', {
            call: this.getGroupCallInput(id),
            ids: [],
            sources: [],
            offset: '',
            limit: GROUP_CALL_PARTICIPANTS_LOAD_LIMIT
          });
        } catch(err) {
          this.log.warn('participants resync after dropped update failed', {id}, err);
          return;
        }

        if(!this.isParticipantFetchGenerationCurrent(id, generation)) return;
        if(this.isParticipantVersionOlder(id, result.version)) {
          // The replica is still behind the cursor the drop was gated on; give
          // it one beat to converge, then leave healing to the next update.
          if(attempt === 0) {
            await pause(1000);
            continue;
          }
          return;
        }

        this.saveParticipantVersion(id, result.version);
        this.appChatsManager.saveApiChats(result.chats);
        this.appUsersManager.saveApiUsers(result.users);
        this.saveApiParticipants(id, result.participants);
        return;
      }
    })().finally(() => {
      resyncs.delete(id);
    });
    resyncs.set(id, promise);
  }

  private processGroupCallParticipantsUpdate(update: Update.updateGroupCallParticipants): void {
    if(update.call._ !== 'inputGroupCall') {
      this.log.warn('updateGroupCallParticipants: non-canonical call input');
      return;
    }

    const call = update.call;
    const currentVersion = this.participantVersions.get(call.id);
    if(this.isParticipantVersionOlder(call.id, update.version)) {
      this.log.warn('updateGroupCallParticipants: ignored stale version', {
        id: call.id,
        version: update.version,
        currentVersion
      });
      // The dropped payload may have carried a joiner's only announcement.
      this.resyncParticipantsAfterDroppedUpdate(call.id);
      return;
    }

    if(currentVersion !== undefined && update.version > currentVersion + 1) {
      // A forward gap means we missed intermediate participant deltas the same
      // way a stale drop loses this one — reload rather than move on (tdlib
      // does a full participants sync in both situations).
      this.resyncParticipantsAfterDroppedUpdate(call.id);
    }

    this.saveParticipantVersion(call.id, update.version);
    const groupCall = this.saveGroupCall(call);
    if(groupCall._ === 'groupCallDiscarded') return;
    if(groupCall._ === 'groupCall' && update.version > groupCall.version) {
      groupCall.version = update.version;
    }

    this.saveApiParticipants(call.id, update.participants);
  }

  private prepareToSavingNextOffset(groupCallId: GroupCallId) {
    const nextOffsetsMap = this.nextOffsets;
    const generation = this.getParticipantFetchGeneration(groupCallId);

    const setNextOffset = (newNextOffset: string) => {
      if(this.isParticipantFetchGenerationCurrent(groupCallId, generation) &&
        nextOffsetsMap.get(groupCallId) === nextOffset) {
        nextOffsetsMap.set(groupCallId, newNextOffset);
      }
    };

    const nextOffset = nextOffsetsMap.get(groupCallId);
    return {
      generation,
      nextOffset,
      setNextOffset
    };
  }

  public saveApiParticipant(groupCallId: GroupCallId, participant: GroupCallParticipant) {
    const participants = this.getCachedParticipants(groupCallId);

    const peerId = getPeerId(participant.peer);

    const oldParticipant = participants.get(peerId);
    const hasLeft = participant.pFlags.left;
    if(!oldParticipant && hasLeft) {
      return;
    }

    // * fix missing flag
    if(!participant.pFlags.muted && !participant.pFlags.can_self_unmute) {
      participant.pFlags.can_self_unmute = true;
    }

    if(oldParticipant) {
      if(participant.pFlags.min) {
        keepPersonalFieldsFromCachedParticipant(oldParticipant, participant);
      }
      safeReplaceObject(oldParticipant, participant);
      participant = oldParticipant;
    } else {
      participants.set(peerId, participant);
    }
    this.participantRevisions.set(participant, (this.participantRevisions.get(participant) || 0) + 1);

    const groupCall = this.getGroupCall(groupCallId);
    if(groupCall?._ === 'groupCall') {
      let modified = false;
      if(hasLeft) {
        // Clamped like tdesktop's _serverParticipantsCount: a `left` for a row
        // whose join this bookkeeping never counted (polls carry no
        // `just_joined`) drifted the counter below zero. The next
        // updateGroupCall / roster page resets it to the server's value anyway.
        if(groupCall.participants_count > 0) {
          --groupCall.participants_count;
          modified = true;
        }
      } else if(participant.pFlags.just_joined && !oldParticipant && !participant.pFlags.self) {
        ++groupCall.participants_count;
        modified = true;
      }

      if(modified) {
        this.rootScope.dispatchEvent('group_call_update', groupCall);
      }
    }
    if(hasLeft) {
      participants.delete(peerId);
    }

    this.rootScope.dispatchEvent('group_call_participant', {
      groupCallId,
      participant
    });
  }

  public saveApiParticipants(groupCallId: GroupCallId, apiParticipants: GroupCallParticipant[]) {
    if((apiParticipants as any).saved) return;
    (apiParticipants as any).saved = true;
    apiParticipants.forEach((p) => this.saveApiParticipant(groupCallId, p));
  }

  public async editParticipant(groupCallId: GroupCallId, participant: GroupCallParticipant, options: Partial<{
    muted: boolean,
    volume: number,
    raiseHand: boolean,
    videoStopped: boolean,
    videoPaused: boolean,
    presentationPaused: boolean
  }>, optimistic = true) {
    if(optimistic) this.saveApiParticipant(groupCallId, participant);

    const participantPeerId = getPeerId(participant.peer);
    const cachedParticipant = optimistic ? undefined : this.getCachedParticipants(groupCallId).get(participantPeerId);
    const cachedParticipantRevision = cachedParticipant && this.participantRevisions.get(cachedParticipant);
    const peerId = participant.pFlags.self ? NULL_PEER_ID : participantPeerId;
    const updates = await this.apiManager.invokeApiSingle('phone.editGroupCallParticipant', {
      call: this.getGroupCallInput(groupCallId),
      participant: peerId === NULL_PEER_ID ? this.appPeersManager.getInputPeerSelf() : this.appPeersManager.getInputPeerById(peerId),
      muted: options.muted,
      volume: options.volume,
      raise_hand: options.raiseHand,
      video_paused: options.videoPaused,
      video_stopped: options.videoStopped,
      presentation_paused: options.presentationPaused
    });

    // Publish a non-optimistic row only after the server accepts the mutation.
    if(!optimistic) {
      const currentParticipant = this.getCachedParticipants(groupCallId).get(participantPeerId);
      const cacheUnchanged = currentParticipant === cachedParticipant &&
        (!currentParticipant || this.participantRevisions.get(currentParticipant) === cachedParticipantRevision);
      if(cacheUnchanged) {
        try {
          this.saveApiParticipant(groupCallId, participant);
        } catch(err) {
          this.log.error('save accepted group call participant failed', err);
        }
      }
    }
    try {
      this.apiUpdatesManager.processUpdateMessage(updates);
    } catch(error) {
      // The server already accepted this exact participant state. Rejecting
      // here would make the caller roll back capture to the pre-RPC state.
      this.log.error('edit group call participant update processing failed after RPC acceptance', error);
    }
  }

  public getGroupCall(id: GroupCallId) {
    return this.groupCalls.get(id);
  }

  private savePhoneGroupCall(result: PhoneGroupCall, nextOffsetMode: NextOffsetSaveMode): GroupCall {
    if(result.call._ === 'groupCall' &&
      this.isParticipantVersionOlder(result.call.id, result.call.version)) {
      // The discarded snapshot carried participant rows; make sure a fresh
      // consistent page replaces them rather than dropping them outright.
      if(result.participants?.length) {
        this.resyncParticipantsAfterDroppedUpdate(result.call.id);
      }
      const current = this.getGroupCall(result.call.id);
      return current && current._ !== 'inputGroupCall' ? current : result.call;
    }

    if(nextOffsetMode === 'replace' && result.call._ !== 'groupCallDiscarded') {
      this.invalidateParticipantFetches(result.call.id);
    }

    if(result.call._ === 'groupCall') {
      this.saveParticipantVersion(result.call.id, result.call.version);
    }

    this.appUsersManager.saveApiUsers(result.users);
    this.appChatsManager.saveApiChats(result.chats);

    // Keep the server's participants_count authoritative. Importing participants
    // can transiently adjust `just_joined` counters, so save them first and let
    // the following saveGroupCall restore the exact server count.
    if(result.call._ !== 'groupCallDiscarded') {
      this.saveApiParticipants(result.call.id, result.participants);
    }

    const call = this.saveGroupCall(result.call) as GroupCall;
    if(call._ === 'groupCallDiscarded') return call;

    if(nextOffsetMode === 'replace' ||
      (nextOffsetMode === 'initialize' && this.nextOffsets.get(call.id) === undefined)) {
      this.nextOffsets.set(call.id, result.participants_next_offset);
    }

    return call;
  }

  public async getGroupCallFull(id: GroupCallId, override?: boolean): Promise<GroupCall> {
    const call = this.getGroupCall(id);
    if(call && call._ !== 'inputGroupCall' && !override) {
      return call;
    }

    const generation = this.getParticipantFetchGeneration(id);
    const limit = this.getCachedParticipants(id).size ? 0 : GROUP_CALL_PARTICIPANTS_LOAD_LIMIT;
    return this.apiManager.invokeApiSingleProcess({
      method: 'phone.getGroupCall',
      params: {
        call: this.getGroupCallInput(id),
        limit
      },
      processResult: (groupCall) => {
        if(!this.isParticipantFetchGenerationCurrent(id, generation)) {
          const current = this.getGroupCall(id);
          return current && current._ !== 'inputGroupCall' ? current : groupCall.call;
        }

        return this.savePhoneGroupCall(
          groupCall,
          limit ? 'initialize' : 'skip'
        );
      },
      options: {cacheKey: JSON.stringify([id, generation, limit])}
    });
  }

  /**
   * Resolve any conference reference (canonical id, slug or invite message)
   * through the domain manager before UI policy decides whether this is the
   * call that is already open. Keeping this here also makes sure the returned
   * peers, call and participant rows enter the same caches as getGroupCallFull.
   */
  public async resolveConferenceCall(input: InputGroupCall): Promise<GroupCall> {
    return (await this.fetchConferenceCall(input, 0)).call;
  }

  /**
   * The same resolve, plus the people the server lists as being in the call —
   * what the join confirmation shows. Reported from the response rather than
   * from the participant cache, which can still hold rows from an earlier
   * visit to this call.
   */
  public async resolveConferenceCallPreview(input: InputGroupCall, limit = CONFERENCE_PREVIEW_PARTICIPANTS_LIMIT) {
    const {call, participants} = await this.fetchConferenceCall(input, limit);
    return {
      call,
      participantPeerIds: (participants || []).map((participant) => getPeerId(participant.peer))
    };
  }

  private async fetchConferenceCall(input: InputGroupCall, limit: number) {
    const result = await this.apiManager.invokeApi('phone.getGroupCall', {
      call: input,
      limit
    });

    return {
      call: this.savePhoneGroupCall(result, 'replace'),
      participants: result.participants
    };
  }

  public saveGroupCall(call: MyGroupCall, peerId?: PeerId) {
    const oldCall = this.groupCalls.get(call.id);
    if(call._ === 'groupCall' && oldCall && this.isParticipantVersionOlder(call.id, call.version)) {
      return oldCall;
    }
    if(call._ === 'groupCall') {
      this.saveParticipantVersion(call.id, call.version);
    }
    if(call._ === 'groupCallDiscarded' && oldCall?._ !== 'groupCallDiscarded') {
      this.invalidateParticipantFetches(call.id);
    }
    const shouldUpdate = call._ !== 'inputGroupCall' && (!oldCall || oldCall._ !== 'groupCallDiscarded');
    if(oldCall) {
      if(shouldUpdate) {
        safeReplaceObject(oldCall, call);
      }

      call = oldCall;
    } else {
      this.groupCalls.set(call.id, call);
    }

    if(shouldUpdate) {
      this.rootScope.dispatchEvent('group_call_update', call as any);
    }

    return call;
  }

  public async createGroupCall(chatId: ChatId, scheduleDate?: number, title?: string, rtmp = false) {
    const updates = await this.apiManager.invokeApi('phone.createGroupCall', {
      peer: this.appPeersManager.getInputPeerById(chatId.toPeerId(true)),
      random_id: nextRandomUint(32),
      schedule_date: scheduleDate,
      title,
      rtmp_stream: rtmp
    });

    const input = getInputGroupCallFromUpdates(updates);
    try {
      if(!input) throw new Error('createGroupCall: no unique active group call in response');
      this.apiUpdatesManager.processUpdateMessage(updates);

      const update = getUpdatesList(updates).find((update): update is Update.updateGroupCall => {
        return update._ === 'updateGroupCall' &&
          update.call._ === 'groupCall' &&
          sameInputGroupCall(groupCallToInput(update.call), input);
      });
      if(!update) throw new Error('createGroupCall: accepted call update disappeared');
      return update.call;
    } catch(error) {
      if(input) {
        try {
          await this.discardGroupCall(input);
        } catch(rollbackError) {
          this.log.warn('createGroupCall: accepted call rollback failed', rollbackError);
        }
      }
      throw error;
    }
  }

  public getGroupCallInput(id: GroupCallId): InputGroupCall {
    const groupCall = this.getGroupCall(id);
    if(!groupCall) throw new Error(`Group call ${id} not found`);
    return groupCallToInput(groupCall as GroupCall.groupCall);
  }

  // public generateSelfParticipant(): GroupCallParticipant {
  //   const mainSources = this.currentGroupCall.connections.main.sources;
  //   const presentationSources = this.currentGroupCall.connections.presentation?.sources;
  //   return {
  //     _: 'groupCallParticipant',
  //     pFlags: {
  //       can_self_unmute: true,
  //       self: true
  //     },
  //     source: mainSources.audio.source,
  //     video: this.generateSelfVideo(mainSources.video),
  //     presentation: presentationSources && this.generateSelfVideo(presentationSources.video, presentationSources.audio?.source),
  //     date: tsNow(true),
  //     peer: this.appPeersManager.getOutputPeer(rootScope.myId)
  //   };
  // }

  public async getGroupCallParticipants(id: GroupCallId) {
    const {generation, nextOffset, setNextOffset} = this.prepareToSavingNextOffset(id);

    if(nextOffset !== '') {
      await this.apiManager.invokeApiSingleProcess({
        method: 'phone.getGroupParticipants',
        params: {
          call: this.getGroupCallInput(id),
          ids: [],
          sources: [],
          offset: nextOffset || '',
          limit: GROUP_CALL_PARTICIPANTS_LOAD_LIMIT
        },
        processResult: (groupCallParticipants) => {
          if(!this.isParticipantFetchGenerationCurrent(id, generation)) {
            return;
          }
          if(this.isParticipantVersionOlder(id, groupCallParticipants.version)) {
            // This may be the one-and-only initial page of a legacy join —
            // discarding it silently would leave every listed participant
            // without a recv m-line. Heal through the bounded resync.
            this.resyncParticipantsAfterDroppedUpdate(id);
            return;
          }

          const newNextOffset = groupCallParticipants.count === groupCallParticipants.participants.length ? '' : groupCallParticipants.next_offset;

          this.saveParticipantVersion(id, groupCallParticipants.version);
          this.appChatsManager.saveApiChats(groupCallParticipants.chats);
          this.appUsersManager.saveApiUsers(groupCallParticipants.users);
          this.saveApiParticipants(id, groupCallParticipants.participants);

          setNextOffset(newNextOffset);
        },
        // A new main connection for the same call id must never inherit the raw
        // response promise started by the previous connection generation.
        options: {cacheKey: JSON.stringify([id, generation, nextOffset || ''])}
      });
    }

    return {
      participants: this.getCachedParticipants(id),
      isEnd: this.nextOffsets.get(id) === ''
    };
  }

  /**
   * Resolve participant rows by an SSRC observed on the media path. Telegram
   * transports SSRCs as signed int32 values, while WebRTC exposes an unsigned
   * synchronizationSource. The caller validates E2E membership before saving
   * any returned row into the participant cache.
   */
  public async getGroupCallParticipantsBySources(
    id: GroupCallId,
    sources: number[]
  ): Promise<GroupCallParticipant[]> {
    const requestedSources = [...new Set(sources)]
    .filter((source) => Number.isSafeInteger(source) && source >= 0 && source <= 0xFFFFFFFF)
    .slice(0, GROUP_CALL_PARTICIPANTS_LOAD_LIMIT);
    if(!requestedSources.length) return [];

    const generation = this.getParticipantFetchGeneration(id);
    const result = await this.apiManager.invokeApi('phone.getGroupParticipants', {
      call: this.getGroupCallInput(id),
      ids: [],
      sources: requestedSources.map(toTelegramSource),
      offset: '',
      limit: GROUP_CALL_PARTICIPANTS_LOAD_LIMIT
    });
    if(!this.isParticipantFetchGenerationCurrent(id, generation)) {
      return [];
    }

    // This is a targeted slice, not a complete participant-state snapshot.
    // Its version must neither advance the global cursor (which would make us
    // skip intervening updates for other peers) nor be rejected by that cursor
    // (an older slice can still resolve the exact requested SSRC safely; the
    // instance validates current E2E membership and ownership before saving).
    this.appChatsManager.saveApiChats(result.chats);
    this.appUsersManager.saveApiUsers(result.users);
    return result.participants;
  }

  /**
   * The call plus the first `limit` participant peers — everything the chat
   * topbar plate needs to render (title, counter, avatar stack) in one hop,
   * without shipping the whole participants map across the worker boundary.
   *
   * `getGroupCallFull` short-circuits on an already-cached call, so the roster
   * can still be empty after it resolves — fall back to an explicit fetch then.
   */
  public async getGroupCallPreview(id: GroupCallId, limit: number) {
    const call = await this.getGroupCallFull(id);
    if(call._ !== 'groupCall') {
      return {call, peerIds: [] as PeerId[]};
    }

    let participants = this.getCachedParticipants(id);
    if(!participants.size) {
      ({participants} = await this.getGroupCallParticipants(id));
    }

    const peerIds: PeerId[] = [];
    for(const peerId of participants.keys()) {
      if(peerIds.length >= limit) break;
      peerIds.push(peerId);
    }

    return {call, peerIds};
  }

  /**
   * Re-fetch the full SFU participant list and reconcile it against our cache.
   *
   * Conferences (TdE2E) don't get reliable `updateGroupCallParticipants` pushes
   * the way legacy voice chats do — the official clients drive conference
   * membership off the e2e blockchain and poll the SFU for the matching
   * participant objects (tdesktop `trackParticipantsWithAccess`, Android
   * `ConferenceCall.checkParticipants`). Without an equivalent here the count +
   * roster freeze at their connect-time snapshot. `GroupCallInstance` calls this
   * on a timer and whenever the e2e group_state changes.
   *
   * Unlike `getGroupCallParticipants`, this always does a fresh fetch (it
   * ignores the pagination cursor) and additionally marks cached participants
   * that are no longer present as `left`, so leaves propagate too.
   *
   * Returns what the server listed (see `ConferenceRosterSnapshot`) so the tab
   * can reconcile it against the e2e chain membership — the roster alone is NOT
   * the access list, see `@lib/calls/e2e/conferenceMembership`.
   */
  public refreshConferenceParticipants(
    id: GroupCallId,
    options?: {includeSelf?: boolean, selfSource?: number}
  ): Promise<ConferenceRosterSnapshot | false> {
    const groupCall = this.getGroupCall(id);
    if(!groupCall || groupCall._ !== 'groupCall') {
      // No cached call → getGroupCallInput would throw, so there is nothing to
      // fetch. Answer `false` straight away (before any dedup bookkeeping) so
      // the instance's watchdog sees the roster sync isn't running and
      // re-hydrates.
      return Promise.resolve(false);
    }

    const existing = this.conferenceRosterFetches.get(id);
    if(existing) {
      // The poll timer, the chain-change hook and the stall watchdog all call
      // this; a walk already in flight answers all of them.
      return existing;
    }

    const generation = this.getParticipantFetchGeneration(id);
    const promise = this.fetchWholeConferenceRoster(id, generation, options).finally(() => {
      if(this.conferenceRosterFetches.get(id) === promise) {
        this.conferenceRosterFetches.delete(id);
      }
    });
    this.conferenceRosterFetches.set(id, promise);
    return promise;
  }

  /**
   * Walk `phone.getGroupParticipants` until the roster is exhausted, then
   * reconcile it against the cache.
   *
   * Paging is what makes `complete` mean anything. Deciding it from one page
   * meant comparing the page length against the server's own `count`, so a
   * backend could return a FULL page alongside an inflated count and keep the
   * roster permanently "incomplete" — which switched off chain reconciliation
   * entirely: no disclosure of chain-only key holders, and no `only_left` rekey
   * to evict them. Walking to a short page makes completeness something we
   * observe instead of something we are told.
   */
  private async fetchWholeConferenceRoster(
    id: GroupCallId,
    generation: number,
    options?: {includeSelf?: boolean, selfSource?: number}
  ): Promise<ConferenceRosterSnapshot | false> {
    if(!this.isParticipantFetchGenerationCurrent(id, generation)) {
      return false;
    }

    const selfPeerId = this.rootScope.myId;
    // Some snapshots omit pFlags.self even though peer identity is exact. The
    // instance requires that flag to install its canonical self participant,
    // so normalize only the row whose peer id is our own.
    const normalizeParticipant = (participant: GroupCallParticipant): GroupCallParticipant => {
      if(getPeerId(participant.peer) !== selfPeerId || participant.pFlags.self) {
        return participant;
      }
      return {...participant, pFlags: {...participant.pFlags, self: true as const}};
    };
    // A dispatched self row runs the instance's `source !== participant.source`
    // kill switch, which ends the whole call — the reason ordinary polls skip
    // self entirely. The hydration path may include it, but only when the
    // snapshot's source matches the live connection: a server snapshot that
    // still shows a previous connection's self row (replication lag, a ghost
    // row after a tab-reload rejoin) must be skipped and retried, never fed to
    // the kill switch. Observed live as "I get dropped when someone joins".
    const acceptParticipant = (participant: GroupCallParticipant): boolean => {
      if(getPeerId(participant.peer) !== selfPeerId) return true;
      if(!options?.includeSelf) return false;
      if(options.selfSource !== undefined && participant.source !== options.selfSource) {
        this.log.warn('conference roster: skipped stale self row', {
          id,
          snapshotSource: participant.source,
          liveSource: options.selfSource
        });
        return false;
      }
      return true;
    };

    const normalizedParticipants: GroupCallParticipant[] = [];
    let offset = '';
    let count = 0;
    let complete = false;
    // The roster can change under a cursor walk. `version` is the server's own
    // generation counter for the participant list, so if it moves between pages
    // the pages we stitched together never coexisted — and a participant that
    // shifted across the cursor boundary would be missing from the union. That
    // matters here more than it looks: an "absent" participant is marked left,
    // and if they are on the e2e chain they are also reported as a chain-only
    // key holder and scheduled for only_left eviction. Refuse to call such a
    // walk complete.
    let version: number | undefined;
    let haveVersion = false;

    for(let page = 0; page < MAX_CONFERENCE_ROSTER_PAGES; ++page) {
      const groupCall = this.getGroupCall(id);
      if(!groupCall || groupCall._ !== 'groupCall') {
        // No cached call → getGroupCallInput would throw. Report `false` so the
        // instance's watchdog sees the roster sync isn't running and re-hydrates.
        return false;
      }

      const result = await this.apiManager.invokeApi('phone.getGroupParticipants', {
        call: this.getGroupCallInput(id),
        ids: [],
        sources: [],
        offset,
        limit: GROUP_CALL_PARTICIPANTS_LOAD_LIMIT
      });

      if(!this.isParticipantFetchGenerationCurrent(id, generation)) {
        return false;
      }
      if(this.isParticipantVersionOlder(id, result.version)) {
        return false;
      }
      this.saveParticipantVersion(id, result.version);

      this.appChatsManager.saveApiChats(result.chats);
      this.appUsersManager.saveApiUsers(result.users);
      const pageParticipants = result.participants.map(normalizeParticipant);
      normalizedParticipants.push(...pageParticipants);
      count = result.count;

      // Apply each page AS IT ARRIVES — adds late joiners (and their SSRCs, so
      // the conference recv transceivers get created) and refreshes muted/video
      // state. This is the only delivery path for conference participant rows
      // (there are no reliable pushes), so it must not be hostage to the WHOLE
      // walk finishing untorn: on a large churning roster a mid-walk version
      // bump used to discard every page, and a joiner's audio/video never
      // appeared for the rest of the call. Each page passed the version gate
      // above, so per-row application is at least as fresh as the cache;
      // only leave-reconciliation below needs the complete coherent union.
      this.saveApiParticipants(id, pageParticipants.filter(acceptParticipant));

      if(!haveVersion) {
        // Track "have we seen one" separately: keying off `version === undefined`
        // meant a first page whose `version` was itself undefined never latched,
        // so the consistency check silently never ran for the rest of the walk.
        haveVersion = true;
        version = result.version;
      } else if(result.version !== version) {
        // The list moved mid-walk; the union is not a snapshot of anything.
        break;
      }

      // A short page or an empty cursor is the end of the list. The cursor is
      // needed for exact multiples of the page limit: a 100/200-member roster
      // legitimately ends on a full page, so requiring one more short page
      // would mark that complete snapshot incomplete forever.
      if(result.participants.length < GROUP_CALL_PARTICIPANTS_LOAD_LIMIT || !result.next_offset) {
        complete = true;
        break;
      }

      // A repeated non-empty cursor cannot make progress. Stop, but do NOT
      // claim completeness.
      if(result.next_offset === offset) {
        break;
      }

      offset = result.next_offset;
    }

    const groupCall = this.getGroupCall(id);
    if(!this.isParticipantFetchGenerationCurrent(id, generation) ||
      !groupCall || groupCall._ !== 'groupCall') {
      return false;
    }

    if(!complete) {
      // Worth saying out loud rather than returning a quiet `false`. An
      // incomplete roster disables chain reconciliation entirely — no
      // disclosure of chain-only key holders, no only_left rekey — so a backend
      // that never lets the walk finish switches the whole defence off. The
      // caller escalates when it keeps happening.
      this.log.warn('conference roster walk did not complete', {id, pages: MAX_CONFERENCE_ROSTER_PAGES, got: normalizedParticipants.length});
    }

    const cached = this.getCachedParticipants(id);

    // `left` rows are NOT roster membership. This set is what the e2e chain is
    // diffed against, and the chain — not the SFU — is the access list, so
    // counting a `left` row as "present" hides whoever it names. A backend that
    // self-adds an identity to the chain and then reports it as `left` used to
    // vanish from both paths at once: present here (so never a chain-only
    // member) and absent from the participant list (saveApiParticipant
    // early-returns for an uncached `left` row) — while still holding the key.
    // tdesktop erases `left` before anything else (data_group_call.cpp:726-744),
    // so such an identity stays in its stale set and is rekeyed away from.
    const live = normalizedParticipants.filter((p) => !p.pFlags.left);
    const freshPeerIds = new Set(live.map((p) => getPeerId(p.peer)));
    const freshUserIds = live
    .map((p) => (p.peer as Peer.peerUser).user_id)
    .filter((userId) => userId !== undefined)
    .map(String);

    // Reconcile leaves: a cached participant absent from the fresh list has
    // left. Only safe on a complete roster — with a truncated one "absent" just
    // means "on a page we never got", and we'd evict real participants.
    if(complete) {
      // Snapshot the entries first — saveApiParticipant mutates the map.
      // Identify ourselves by IDENTITY, never by a server-supplied flag on a
      // cached row. `pFlags.self` comes from the server and `safeReplaceObject`
      // overwrites the cached row wholesale, so a row that arrives without the
      // flag drops our own guard — and since a `left` row no longer counts as
      // roster presence, we would then synthesise a `left` for ourselves and
      // evict the user from their own call.
      for(const [peerId, participant] of [...cached]) {
        if(peerId === selfPeerId || participant.pFlags.self || freshPeerIds.has(peerId)) {
          continue;
        }

        // Mirror the shape a server `left` update would carry. This drives
        // group_call_participant (roster removal) + the count decrement.
        this.saveApiParticipant(id, {
          ...participant,
          pFlags: {...participant.pFlags, left: true}
        });
      }
    }

    // Row application happened per page inside the walk (see the loop) — only
    // the leave-reconciliation above and chain reconciliation (via the returned
    // snapshot) require the complete coherent union.

    // Server count is authoritative — the per-participant +/- bookkeeping in
    // saveApiParticipant can't see joins (no `just_joined` on a poll).
    if(groupCall.participants_count !== count) {
      groupCall.participants_count = count;
      this.rootScope.dispatchEvent('group_call_update', groupCall);
    }

    return {complete, userIds: freshUserIds};
  }

  private processGroupCallTermination(call: InputGroupCall, updates: Updates): void {
    if(call._ === 'inputGroupCall') {
      this.invalidateParticipantFetches(call.id);
      // Clear pagination/cache before processing the response so a malformed
      // update cannot leave stale participant state behind for a later join.
      this.participants.delete(call.id);
    }
    try {
      this.apiUpdatesManager.processUpdateMessage(updates);
    } catch(error) {
      // Leave/discard is already committed server-side; callers must not retry
      // it because only local application of the returned updates failed.
      this.log.error('terminate group call update processing failed after RPC acceptance', error);
    }
  }

  public async leaveGroupCall(call: InputGroupCall, source: number): Promise<void> {
    const updates = await this.apiManager.invokeApi('phone.leaveGroupCall', {call, source});
    this.processGroupCallTermination(call, updates);
  }

  public async discardGroupCall(call: InputGroupCall): Promise<void> {
    const updates = await this.apiManager.invokeApi('phone.discardGroupCall', {call});
    this.processGroupCallTermination(call, updates);
  }

  public hangUp(id: GroupCallId, discard: true | number) {
    const call = this.getGroupCallInput(id);
    if(discard === true) {
      return this.discardGroupCall(call);
    }
    return this.leaveGroupCall(call, discard);
  }

  public async createConferenceCall(
    params: DataJSON,
    options: MainGroupCallConnectionOptions
  ): Promise<ResolvedGroupCallConnection> {
    if(!options.e2ePublicKey || !options.e2eBlock) {
      throw new Error('createConferenceCall: missing conference key material');
    }

    const updates = await this.apiManager.invokeApi('phone.createConferenceCall', {
      muted: options.isMuted,
      video_stopped: !options.joinVideo,
      join: true,
      random_id: nextRandomUint(32),
      public_key: options.e2ePublicKey,
      block: options.e2eBlock,
      params
    });
    const acceptedCallInput = getInputGroupCallFromUpdates(updates);

    try {
      const connectionUpdate = this.getGroupCallConnectionUpdate(updates, 'createConferenceCall');
      if(!acceptedCallInput) {
        throw new Error('createConferenceCall: no unique active group call in response');
      }
      const groupCallUpdate = findResolvedGroupCallUpdate(updates, acceptedCallInput);
      if(!groupCallUpdate) {
        throw new Error('createConferenceCall: accepted group call update disappeared');
      }
      this.invalidateParticipantFetches(acceptedCallInput.id);
      return this.processAcceptedGroupCallConnection(
        updates,
        connectionUpdate,
        acceptedCallInput,
        groupCallUpdate,
        'createConferenceCall'
      );
    } catch(error) {
      if(acceptedCallInput) {
        try {
          await this.discardGroupCall(acceptedCallInput);
        } catch(rollbackError) {
          this.log.warn('createConferenceCall: accepted create rollback failed', rollbackError);
        }
      }
      throw error;
    }
  }

  public async joinGroupCall(
    groupCallId: GroupCallId,
    params: DataJSON,
    options: GroupCallConnectionInstance['options']
  ): Promise<ResolvedGroupCallConnection> {
    // Conference invitees may not have a cached id+access_hash yet — they pass
    // `inputGroupCallSlug` or `inputGroupCallInviteMessage` instead. Honour
    // the override when set; the join response carries the real
    // updateGroupCall(id, access_hash) which the rest of the app picks up.
    const groupCallInput = (options.type === 'main' && options.e2eCallInput) ?
      options.e2eCallInput :
      this.getGroupCallInput(groupCallId);
    let invalidatedParticipantFetchCallId: GroupCallId | undefined;
    if(options.type === 'main') {
      const expectedCallInput = groupCallInput._ === 'inputGroupCall' ?
        groupCallInput :
        options.e2eExpectedCallInput;
      if(expectedCallInput?._ === 'inputGroupCall') {
        // Invalidate the previous connection before the rejoin RPC starts: an
        // old page can resolve while that RPC is still in flight.
        this.invalidateParticipantFetches(expectedCallInput.id);
        invalidatedParticipantFetchCallId = expectedCallInput.id;
      }
    }
    let promise: Promise<Updates>;
    if(options.type === 'main') {
      const request: PhoneJoinGroupCall = {
        call: groupCallInput,
        join_as: this.appPeersManager.getInputPeerSelf(),
        params,
        muted: options.isMuted,
        video_stopped: !options.joinVideo
      };

      // Conference (TdE2E) extras — only set when the caller drove the join
      // through the e2e path. Server distinguishes a conference join by the
      // presence of both fields.
      if(options.e2ePublicKey) request.public_key = options.e2ePublicKey;
      if(options.e2eBlock) request.block = options.e2eBlock;

      promise = this.apiManager.invokeApi('phone.joinGroupCall', request);
      this.log(`[api] joinGroupCall id=${groupCallId}`, request);
    } else {
      const request: PhoneJoinGroupCallPresentation = {
        call: groupCallInput,
        params
      };

      promise = this.apiManager.invokeApi('phone.joinGroupCallPresentation', request);
      this.log(`[api] joinGroupCallPresentation id=${groupCallId}`, request);
    }

    const updates = await promise;
    let acceptedCallInput = groupCallInput;
    try {
      const connectionUpdate = this.getGroupCallConnectionUpdate(updates, 'joinGroupCall');
      // A canonical request already proves its identity. Slug/message requests
      // keep their revocable authorization, while the separately supplied
      // preview identity is the only canonical call they may promote to.
      const expectedCallInput = options.type === 'main' ? options.e2eExpectedCallInput : undefined;
      const groupCallUpdate = findResolvedGroupCallUpdate(updates, groupCallInput, expectedCallInput);
      if(groupCallInput._ !== 'inputGroupCall' && !groupCallUpdate) {
        throw new Error('joinGroupCall: accepted non-canonical call did not match its preview identity');
      }
      if(groupCallUpdate) acceptedCallInput = groupCallToInput(groupCallUpdate.call);

      if(options.type === 'main' && acceptedCallInput._ === 'inputGroupCall' &&
        (invalidatedParticipantFetchCallId === undefined ||
          String(invalidatedParticipantFetchCallId) !== String(acceptedCallInput.id))) {
        this.invalidateParticipantFetches(acceptedCallInput.id);
        invalidatedParticipantFetchCallId = acceptedCallInput.id;
      }

      return this.processAcceptedGroupCallConnection(
        updates,
        connectionUpdate,
        acceptedCallInput,
        groupCallUpdate,
        'joinGroupCall'
      );
    } catch(error) {
      // The RPC already mutated server state. Compensate here because a thrown
      // manager call cannot carry custom Error fields reliably through the
      // worker proxy. The original post-processing error remains the rejection.
      try {
        await this.rollbackAcceptedGroupCallJoin(acceptedCallInput, params, options.type);
      } catch(rollbackError) {
        this.log.warn('joinGroupCall: accepted join rollback failed', rollbackError);
      }
      throw error;
    }
  }

  private getGroupCallConnectionUpdate(
    updates: Updates,
    operation: 'createConferenceCall' | 'joinGroupCall'
  ): Update.updateGroupCallConnection {
    const connectionUpdates = getUpdatesList(updates).filter(
      (item): item is Update.updateGroupCallConnection => item._ === 'updateGroupCallConnection'
    );
    if(!connectionUpdates.length) {
      throw new Error(`${operation}: no updateGroupCallConnection in ${updates._}`);
    }
    if(connectionUpdates.length !== 1) {
      throw new Error(`${operation}: multiple updateGroupCallConnection entries in ${updates._}`);
    }
    return connectionUpdates[0];
  }

  private processAcceptedGroupCallConnection(
    updates: Updates,
    connectionUpdate: Update.updateGroupCallConnection,
    acceptedCallInput: InputGroupCall,
    groupCallUpdate: Update.updateGroupCall & {call: GroupCall.groupCall},
    operation: 'createConferenceCall' | 'joinGroupCall'
  ): ResolvedGroupCallConnection {
    const updatesList = getUpdatesList(updates);
    const resolvedChainUpdates = updatesList.filter(
      (item): item is Update.updateGroupCallChainBlocks => {
        return item._ === 'updateGroupCallChainBlocks' && sameInputGroupCall(item.call, acceptedCallInput);
      }
    );
    const resolvedSubChains = new Set<number>();
    for(const chainUpdate of resolvedChainUpdates) {
      if(resolvedSubChains.has(chainUpdate.sub_chain_id)) {
        throw new Error(
          `${operation}: multiple matching updateGroupCallChainBlocks entries for subchain ${chainUpdate.sub_chain_id} in ${updates._}`
        );
      }
      resolvedSubChains.add(chainUpdate.sub_chain_id);
    }

    this.apiUpdatesManager.processUpdateMessage(updates);

    if(acceptedCallInput._ !== 'inputGroupCall') {
      throw new Error(`${operation}: accepted group call did not resolve a canonical identity`);
    }
    const cachedGroupCall = this.getGroupCall(acceptedCallInput.id);
    if(cachedGroupCall?._ !== 'groupCall') {
      throw new Error(`${operation}: accepted group call is not active after update processing`);
    }
    const resolvedCallInput = groupCallToInput(cachedGroupCall);

    const extended = connectionUpdate as ResolvedGroupCallConnection;
    // Cloneable acceptance metadata crosses the manager proxy boundary. The
    // controller uses it for compensation if worker commit, SDP parsing or
    // setRemoteDescription fails after this method returns.
    extended.acceptedCallInput = resolvedCallInput;
    if(groupCallUpdate) {
      // Keep the id in its native (fetchLong) form — number for small ids,
      // string for large — so it stays === the manager's cache key.
      extended.resolvedCallId = cachedGroupCall.id;
      extended.resolvedAccessHash = cachedGroupCall.access_hash;
      extended.resolvedGroupCall = cachedGroupCall;
    }
    if(resolvedChainUpdates.length) {
      extended.resolvedChainUpdates = resolvedChainUpdates;
    }
    return extended;
  }

  private async rollbackAcceptedGroupCallJoin(
    call: InputGroupCall,
    params: DataJSON,
    type: GroupCallConnectionType
  ): Promise<void> {
    if(type === 'presentation') {
      return this.leaveGroupCallPresentation(call);
    }
    await this.leaveGroupCall(call, getJoinSource(params));
  }

  public async leaveGroupCallPresentation(call: InputGroupCall): Promise<void> {
    const updates = await this.apiManager.invokeApi('phone.leaveGroupCallPresentation', {call});

    try {
      this.apiUpdatesManager.processUpdateMessage(updates);
    } catch(error) {
      // The presentation source is already gone server-side. Keep teardown
      // successful instead of retrying an accepted leave.
      this.log.error('leave group call presentation update processing failed after RPC acceptance', error);
    }
  }

  public async _fetchRtmpState(
    call: InputGroupCall.inputGroupCall,
    retry = 0,
    dcId?: DcId,
    migrations = 0
  ): Promise<GroupCallRtmpState> {
    const full = await this.getGroupCallFull(call.id);
    if(full._ === 'groupCallDiscarded') {
      throw new Error('Group call discarded');
    }

    dcId ??= full.stream_dc_id || await this.apiManager.getBaseDcId();

    try {
      const res = await this.apiManager.invokeApi('phone.getGroupCallStreamChannels', {call}, {dcId});
      return {
        channels: res.channels,
        dcId,
        time: Date.now()
      };
    } catch(error) {
      assumeType<ApiError>(error);

      if(error.type?.indexOf('CALL_MIGRATE') === 0) {
        // Bounded: the server used to be able to bounce us between DCs forever
        // (every answer re-entered with a fresh budget), and a bare
        // `CALL_MIGRATE_` crashed on the match. A DC that names itself again
        // or more than a few hops is a server fault, not a route to follow.
        const migrateDcId = +error.type.match(/^CALL_MIGRATE_(\d+)$/)?.[1] as DcId;
        if(!migrateDcId || migrateDcId === dcId || migrations >= MAX_RTMP_STATE_MIGRATIONS) {
          throw error;
        }
        return this._fetchRtmpState(call, retry, migrateDcId, migrations + 1);
      }

      if(error.type === 'GROUPCALL_INVALID' && retry < 3) {
        // this sometimes happens for some reason. retry
        return this._fetchRtmpState(call, retry + 1);
      }

      throw error;
    }
  }

  public fetchRtmpState(call: InputGroupCall.inputGroupCall, overwrite?: boolean) {
    const callId = call.id;
    const cached = this.cachedStreamChannels.get(callId);
    if(cached && !overwrite) {
      return cached;
    }

    const fetchPromise = this._fetchRtmpState(call);
    const promise = fetchPromise.finally(() => {
      setTimeout(() => {
        if(this.cachedStreamChannels.get(callId) === promise) {
          this.cachedStreamChannels.delete(callId);
        }
      }, 1000);
    });
    this.cachedStreamChannels.set(callId, promise);
    return promise;
  }

  public fetchRtmpPart(location: InputFileLocation.inputGroupCallStream, dcId: number) {
    // return Promise.reject(makeError('TIME_TOO_BIG'));
    return this.apiFileManager.requestFilePart({
      dcId,
      location,
      offset: 0,
      limit: 512 * 1024,
      priority: 32,
      floodMaxTimeout: 0
    }).then((result) => {
      if(!result.bytes.length) {
        return;
      }

      const info = parseVideoStreamInfo(result.bytes);
      return info;
    });
  }

  public fetchRtmpUrl(peerId: PeerId, revoke = false) {
    return this.apiManager.invokeApi('phone.getGroupCallStreamRtmpUrl', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      revoke
    });
  }

  public async startRecording(call: InputGroupCall, params: CallRecordParams) {
    const updates = await this.apiManager.invokeApi('phone.toggleGroupCallRecord', {
      start: true,
      call,
      video: params.recordVideo,
      video_portrait: params.videoHorizontal,
      title: params.name || undefined
    });

    this.apiUpdatesManager.processUpdateMessage(updates);
  }

  public async stopRecording(call: InputGroupCall) {
    const updates = await this.apiManager.invokeApi('phone.toggleGroupCallRecord', {
      start: false,
      call
    });

    this.apiUpdatesManager.processUpdateMessage(updates);
  }

  // Wraps phone.toggleGroupCallSettings — used by the in-call settings popup
  // to flip "Mute new participants" mid-call. Server returns an Updates set
  // that contains an updateGroupCall with the new join_muted flag; pushing it
  // through apiUpdatesManager lets every open UI (this popup, sidebars, etc.)
  // see the change via the existing group_call_update event.
  public async toggleGroupCallSettings(id: GroupCallId, options: {
    joinMuted?: boolean,
    resetInviteHash?: boolean
  }) {
    const updates = await this.apiManager.invokeApi('phone.toggleGroupCallSettings', {
      call: this.getGroupCallInput(id),
      join_muted: options.joinMuted,
      reset_invite_hash: options.resetInviteHash
    });

    this.apiUpdatesManager.processUpdateMessage(updates);
  }

  // Wraps phone.exportGroupCallInvite. `can_self_unmute` is the listener /
  // speaker distinction tdesktop draws in lng_group_call_share; the caller
  // (shareGroupCallInviteLink) decides who may ask for the speaker link.
  public async exportGroupCallInvite(id: GroupCallId, canSelfUnmute?: boolean) {
    const result = await this.apiManager.invokeApiSingle('phone.exportGroupCallInvite', {
      call: this.getGroupCallInput(id),
      can_self_unmute: canSelfUnmute || undefined
    });

    return result.link;
  }
}
