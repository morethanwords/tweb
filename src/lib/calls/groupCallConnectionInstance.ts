import forEachReverse from '@helpers/array/forEachReverse';
import throttle from '@helpers/schedulers/throttle';
import {GroupCallConnectionType, JoinGroupCallJsonPayload} from '@appManagers/appGroupCallsManager';
import {AppManagers} from '@lib/managers';
import rootScope from '@lib/rootScope';
import CallConnectionInstanceBase, {CallConnectionInstanceOptions} from '@lib/calls/callConnectionInstanceBase';
import GroupCallInstance from '@lib/calls/groupCallInstance';
import filterServerCodecs from '@lib/calls/helpers/filterServerCodecs';
import fixLocalOffer from '@lib/calls/helpers/fixLocalOffer';
import processMediaSection from '@lib/calls/helpers/processMediaSection';
import senderKind from '@lib/calls/helpers/senderKind';
import {E2E_MAIN_CHANNEL_ID, E2E_SCREENCAST_CHANNEL_ID} from '@lib/calls/constants';
import {ConferenceEntry} from '@lib/calls/localConferenceDescription';
import SDP from '@lib/calls/sdp';
import SDPMediaSection from '@lib/calls/sdp/mediaSection';
import {WebRTCLineType} from '@lib/calls/sdpBuilder';
import {UpdateGroupCallConnectionData} from '@lib/calls/types';
import {InputGroupCall} from '@layer';

export default class GroupCallConnectionInstance extends CallConnectionInstanceBase {
  private groupCall: GroupCallInstance;
  public updateConstraints?: boolean;
  private type: GroupCallConnectionType;
  public options: {
    type: Extract<GroupCallConnectionType, 'main'>,
    isMuted?: boolean,
    joinVideo?: boolean,
    rejoin?: boolean,
    // Conference (TdE2E) join: when set, passed to phone.joinGroupCall as
    // the `public_key` + `block` fields. Server treats the join as a
    // conference iff BOTH are present.
    e2ePublicKey?: Uint8Array,
    e2eBlock?: Uint8Array,
    // Override the default `inputGroupCall(id, access_hash)` derived from the
    // GroupCallInstance id. Needed for invite-link / invite-message joins
    // where the joinee doesn't yet have a personal access_hash — they pass
    // `inputGroupCallSlug` or `inputGroupCallInviteMessage` and the server
    // echoes back the real id+access_hash in the join response.
    e2eCallInput?: InputGroupCall,
    // Called when `phone.joinGroupCall` fails with CONF_WRITE_CHAIN_INVALID
    // (the chain advanced between our fetch + submit). Should re-fetch the
    // chain head and return a freshly-built self-add block. WebRTC state
    // (peer connection, SDP, mic) is preserved across the retry — only the
    // e2e block and the resulting `phone.joinGroupCall` request change.
    // Matches tdlib GroupCallManager.cpp:4565-4568 try_join_group_call.
    e2eRebuildBlock?: () => Promise<Uint8Array>,
  } | {
    type: Extract<GroupCallConnectionType, 'presentation'>,
  };

  private updateConstraintsInterval: number;
  public negotiateThrottled: () => void;

  private managers: AppManagers;

  constructor(options: CallConnectionInstanceOptions & {
    groupCall: GroupCallConnectionInstance['groupCall'],
    type: GroupCallConnectionInstance['type'],
    options: GroupCallConnectionInstance['options'],
    managers: AppManagers
  }) {
    super(options);

    this.negotiateThrottled = throttle(this.negotiate.bind(this), 0, false);
  }

  public createPeerConnection() {
    return this.connection || super.createPeerConnection({
      iceServers: [],
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 0
      // sdpSemantics: "unified-plan",
      // extmapAllowMixed: true,
    });
  }

  public createDataChannel() {
    if(this.dataChannel) {
      return this.dataChannel;
    }

    const dataChannel = super.createDataChannel();

    dataChannel.addEventListener('open', () => {
      this.maybeUpdateRemoteVideoConstraints();
    });

    dataChannel.addEventListener('close', () => {
      if(this.updateConstraintsInterval) {
        clearInterval(this.updateConstraintsInterval);
        this.updateConstraintsInterval = undefined;
      }
    });

    return dataChannel;
  }

  public createDescription() {
    if(this.description) {
      return this.description;
    }

    const description = super.createDescription();

    /* const perType = 0;
    const types = ['audio' as const, 'video' as const];
    const count = types.length * perType;
    const init: RTCRtpTransceiverInit = {direction: 'recvonly'};
    types.forEach((type) => {
      for(let i = 0; i < perType; ++i) {
        description.createEntry(type).createTransceiver(connection, init);
      }
    }); */

    return description;
  }

  public appendStreamToConference(onSenderCreated?: (sender: RTCRtpSender) => void) {
    super.appendStreamToConference(onSenderCreated);/* .then(() => {
      currentGroupCall.connections.main.negotiating = false;
      this.startNegotiation({
        type: type,
        isMuted: muted,
        rejoin
      });
    }); */
  }

  private async invokeJoinGroupCall(localSdp: SDP, mainChannels: SDPMediaSection[], options: GroupCallConnectionInstance['options']) {
    const {groupCall, description} = this;
    const groupCallId = groupCall.id;

    // DTLS role (client = passive, SFU = active) is the same for legacy and
    // conference calls — see processMediaSection comment.
    const processedChannels = mainChannels.map((section) => {
      const processed = processMediaSection(localSdp, section);

      this.sources[processed.entry.type as 'video' | 'audio'] = processed.entry;

      return processed;
    });

    const audioChannel = processedChannels.find((channel) => channel.media.mediaType === 'audio');
    const videoChannel = processedChannels.find((channel) => channel.media.mediaType === 'video');
    let {source, params} = audioChannel || {};
    const useChannel = videoChannel || audioChannel;

    const channels: {[type in WebRTCLineType]?: typeof audioChannel} = {
      audio: audioChannel,
      video: videoChannel
    };

    description.entries.forEach((entry) => {
      if(entry.direction === 'sendonly') {
        const channel = channels[entry.type];
        if(!channel) return;

        description.setEntrySource(entry, channel.sourceGroups || channel.source);
        description.setEntryPeerId(entry, rootScope.myId);
      }
    });

    // overwrite ssrc with audio in video params
    if(params !== useChannel.params) {
      const data: JoinGroupCallJsonPayload = JSON.parse(useChannel.params.data);
      // data.ssrc = source || data.ssrc - 1; // audio channel can be missed in screensharing
      if(source) data.ssrc = source;
      else delete data.ssrc;
      params = {
        _: 'dataJSON',
        data: JSON.stringify(data)
      };
    }

    // Conference + legacy both use phone.joinGroupCall — for conferences we
    // additionally pass `public_key` + `block` via the options. Conference
    // creation (the EMPTY phone.createConferenceCall(flags=0) call) is done
    // by the caller (controller) BEFORE we get here.
    //
    // On CONF_WRITE_CHAIN_INVALID — the e2e chain advanced between our fetch
    // and our submit (a concurrent join, key change, etc.). Refetch chain
    // head + rebuild the self-add block + resubmit. WebRTC state stays —
    // only the `block` field changes per attempt. Caps at 5 retries to bound
    // pathological loops; tdlib doesn't cap but we're conservative.
    // Strip the rebuild callback before forwarding — `this.managers` is a
    // worker proxy and `postMessage`'s structured clone refuses functions
    // (silently hanging the call on some browsers). Keep the callback in
    // the closure so the retry loop can still invoke it locally.
    const rebuildBlock = options.type === 'main' ? options.e2eRebuildBlock : undefined;
    const stripCallback = (o: typeof options): typeof options =>
      o.type === 'main' ? {...o, e2eRebuildBlock: undefined} : o;
    const maxRetries = 5;
    let update: Awaited<ReturnType<typeof this.managers.appGroupCallsManager.joinGroupCall>>;
    let activeOptions = options;
    for(let attempt = 0; ; attempt++) {
      try {
        update = await this.managers.appGroupCallsManager.joinGroupCall(groupCallId, params, stripCallback(activeOptions));
        break;
      } catch(err) {
        const msg = (err as {type?: string} | Error & {type?: string})?.type ??
          (err instanceof Error ? err.message : String(err));
        const isChainRace = typeof msg === 'string' && msg.startsWith('CONF_WRITE_CHAIN_INVALID');
        if(!isChainRace || attempt >= maxRetries - 1) throw err;
        if(!rebuildBlock) throw err;
        const newBlock = await rebuildBlock();
        // Build a fresh options bag with the new block — keep WebRTC state.
        activeOptions = {...activeOptions, e2eBlock: newBlock} as typeof activeOptions;
      }
    }

    // Invitee paths (slug / inviteMessage) join under a placeholder instance
    // id. The server hands back the real id+access_hash in updateGroupCall —
    // joinGroupCall stitches them onto `update`. Promote them onto the
    // instance so downstream code (polling, hangUp, leave) works.
    const extras = update as typeof update & {resolvedCallId?: string; resolvedAccessHash?: string};
    if(extras.resolvedCallId && extras.resolvedCallId !== this.groupCall.id) {
      this.groupCall.id = extras.resolvedCallId;
    }

    const data: UpdateGroupCallConnectionData = JSON.parse(update.params.data);

    data.audio = data.audio || groupCall.connections.main.description.audio;
    description.setData(data);
    filterServerCodecs(mainChannels, data);

    return data;
  }

  protected async negotiateInternal() {
    const {connection, description} = this;
    const isNewConnection = connection.iceConnectionState === 'new' && !description.getEntryByMid('0').source;
    const log = this.log.bindPrefix('startNegotiation');
    log('start');

    const originalOffer = await connection.createOffer({iceRestart: false});

    if(isNewConnection && this.dataChannel) {
      const dataChannelEntry = description.createEntry('application');
      dataChannelEntry.setDirection('sendrecv');
    }

    const {sdp: localSdp, offer} = fixLocalOffer({
      offer: originalOffer,
      data: description
    });

    log('[sdp] setLocalDescription', offer.sdp);
    await connection.setLocalDescription(offer);

    const mainChannels = localSdp.media.filter((media) => {
      return media.mediaType !== 'application' && media.isSending;
    });

    if(isNewConnection) {
      try {
        await this.invokeJoinGroupCall(localSdp, mainChannels, this.options);
      } catch(e) {
        this.log.error('[tdweb] joinGroupCall error', e);
      }
    }

    /* if(!data) {
      log('abort 0');
      this.closeConnectionAndStream(connection, streamManager);
      return;
    } */

    /* if(connection.iceConnectionState !== 'new') {
      log(`abort 1 connectionState=${connection.iceConnectionState}`);
      this.closeConnectionAndStream(connection, streamManager);
      return;
    } */
    /* if(this.currentGroupCall !== currentGroupCall || connectionHandler.connection !== connection) {
      log('abort', this.currentGroupCall, currentGroupCall);
      this.closeConnectionAndStream(connection, streamManager);
      return;
    } */

    const isAnswer = true;
    // const _bundleMids = bundleMids.slice();
    const entriesToDelete: ConferenceEntry[] = [];
    const bundle = localSdp.bundle;
    forEachReverse(bundle, (mid, idx, arr) => {
      const entry = description.getEntryByMid(mid);
      // Entry may be undefined for mids we addTransceiver'd outside of
      // the LocalConferenceDescription (e.g. the conference-path's
      // pre-added recvonly transceivers for receive-side e2e transform
      // attachment). Leave such mids in the bundle as-is; Chrome's
      // generated SDP for them is already valid.
      if(entry && entry.shouldBeSkipped(isAnswer)) {
        arr.splice(idx, 1);
        entriesToDelete.push(entry);
      }
    });

    /* forEachReverse(description.entries, (entry, idx, arr) => {
      const mediaSection = _parsedSdp.media.find((section) => section.oa.get('mid').oa === entry.mid);
      const deleted = !mediaSection;
      // const deleted = !_bundleMids.includes(entry.mid); // ! can't use it because certain mid can be missed in bundle
      if(deleted) {
        arr.splice(idx, 1);
      }
    }); */

    const entries = localSdp.media.map((section) => {
      const mid = section.mid;
      let entry = description.getEntryByMid(mid);
      if(!entry) {
        entry = new ConferenceEntry(mid, section.mediaType);
        entry.setDirection('inactive');
      }

      return entry;
    });

    const answerDescription: RTCSessionDescriptionInit = {
      type: 'answer',
      sdp: description.generateSdp({
        bundle,
        entries,
        isAnswer
      })
    };

    entriesToDelete.forEach((entry) => {
      description.deleteEntry(entry);
    });

    log(`[sdp] setRemoteDescription signaling=${connection.signalingState} ice=${connection.iceConnectionState} gathering=${connection.iceGatheringState} connection=${connection.connectionState}`, answerDescription.sdp);
    await connection.setRemoteDescription(answerDescription);

    log('end');
  }

  public negotiate() {
    let promise = this.negotiating;
    if(promise) {
      return promise;
    }

    promise = super.negotiate();

    // NB: don't try to attach e2e transforms here. Chrome rejects
    // `RTCRtpScriptTransform` assignments after the codec has produced its
    // first frame ("Too late to create encoded streams" in the parallel
    // createEncodedStreams API). Senders get their transforms pre-negotiate
    // in groupCallsController.joinConferenceCommon; receivers get them in
    // the `track` event handler, also before the first frame.

    if(this.updateConstraints) {
      promise.then(() => {
        this.maybeUpdateRemoteVideoConstraints();
        this.updateConstraints = false;
      });
    }

    if(this.options.type === 'presentation') {
      promise.then(() => {
        this.connection.getTransceivers().find((transceiver) => {
          if(transceiver.sender?.track?.kind === 'video') {
            transceiver.sender.setParameters({
              ...transceiver.sender.getParameters(),
              degradationPreference: 'maintain-resolution'
            });
          }
        });
      });
    }

    return promise;
  }

  public maybeUpdateRemoteVideoConstraints() {
    if(this.dataChannel.readyState !== 'open') {
      return;
    }

    this.log('maybeUpdateRemoteVideoConstraints');

    // * https://github.com/TelegramMessenger/tgcalls/blob/6f2746e04c9b040f8c8dfc64d916a1853d09c4ce/tgcalls/group/GroupInstanceCustomImpl.cpp#L2549
    type VideoConstraints = {minHeight?: number, maxHeight: number};
    const obj: {
      colibriClass: 'ReceiverVideoConstraints',
      constraints: {[endpoint: string]: VideoConstraints},
      defaultConstraints: VideoConstraints,
      onStageEndpoints: string[]
    } = {
      colibriClass: 'ReceiverVideoConstraints',
      constraints: {},
      defaultConstraints: {maxHeight: 0},
      onStageEndpoints: []
    };

    for(const entry of this.description.entries) {
      if(entry.direction !== 'recvonly' || entry.type !== 'video') {
        continue;
      }

      const {endpoint} = entry;
      obj.onStageEndpoints.push(endpoint);
      obj.constraints[endpoint] = {
        minHeight: 180,
        maxHeight: 720
      };
    }

    this.sendDataChannelData(obj);

    if(!obj.onStageEndpoints.length) {
      if(this.updateConstraintsInterval) {
        clearInterval(this.updateConstraintsInterval);
        this.updateConstraintsInterval = undefined;
      }
    } else if(!this.updateConstraintsInterval) {
      this.updateConstraintsInterval = window.setInterval(this.maybeUpdateRemoteVideoConstraints.bind(this), 5000);
    }
  }

  public addInputVideoStream(stream: MediaStream) {
    // const {sources} = this;
    // if(sources?.video) {
    // const source = this.sources.video.source;
    // stream.source = '' + source;
    this.groupCall.saveInputVideoStream(stream, this.type);
    // }

    this.streamManager.addStream(stream, 'input');
    // Attach the e2e send transform to any sender created here, in the
    // createTransceiver→replaceTrack gap (the only window Chrome accepts it).
    // The MAIN connection's senders are already wired at join
    // (joinConferenceCommon's onSenderCreated hook), so for that connection the
    // video transceiver already exists and this hook does not re-fire. It DOES
    // fire for the PRESENTATION (screen-share) connection, which is created
    // later with no such wiring — without it, screen-share video would go out
    // UNENCRYPTED and the SFU/peer couldn't decrypt it. attachE2eSendTransform
    // no-ops for legacy (non-e2e) calls and for already-transformed senders.
    this.appendStreamToConference((sender) => {
      const kind = senderKind(this.connection, sender);
      // Screencast video uses its own e2e channel so its per-(sender, channel)
      // replay window doesn't contend with the main camera/audio. tde2e keys
      // replay by channel_id; the id value itself isn't validated by the peer
      // (the mismatch check is disabled), only its distinctness matters.
      const channelId = this.type === 'presentation' && kind === 'video' ?
        E2E_SCREENCAST_CHANNEL_ID :
        E2E_MAIN_CHANNEL_ID;
      this.groupCall.attachE2eSendTransform(sender, kind, channelId);
    }); // replace sender track
  }
}
