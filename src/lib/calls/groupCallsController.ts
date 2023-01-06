/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import getGroupCallAudioAsset from '../../components/groupCall/getAudioAsset';
import {MOUNT_CLASS_TO} from '../../config/debug';
import EventListenerBase from '../../helpers/eventListenerBase';
import {GroupCallParticipant, GroupCallParticipantVideo, GroupCallParticipantVideoSourceGroup} from '../../layer';
import {GroupCallId, GroupCallConnectionType} from '../appManagers/appGroupCallsManager';
import {AppManagers} from '../appManagers/managers';
import {logger} from '../logger';
import rootScope from '../rootScope';
import GroupCallInstance from './groupCallInstance';
import GROUP_CALL_STATE from './groupCallState';
import createMainStreamManager from './helpers/createMainStreamManager';
import {generateSsrc} from './localConferenceDescription';
import {WebRTCLineType} from './sdpBuilder';
import StreamManager from './streamManager';
import {Ssrc} from './types';

const IS_MUTED = true;

export function makeSsrcsFromParticipant(participant: GroupCallParticipant) {
  return [
    makeSsrcFromParticipant(participant, 'audio', participant.source),
    participant.video?.audio_source && makeSsrcFromParticipant(participant, 'audio', participant.video.audio_source),
    participant.video && makeSsrcFromParticipant(participant, 'video', participant.video.source_groups, participant.video.endpoint),
    participant.presentation?.audio_source && makeSsrcFromParticipant(participant, 'audio', participant.presentation.audio_source),
    participant.presentation && makeSsrcFromParticipant(participant, 'video', participant.presentation.source_groups, participant.presentation.endpoint)
  ].filter(Boolean);
};

export function makeSsrcFromParticipant(participant: GroupCallParticipant, type: WebRTCLineType, source?: number | GroupCallParticipantVideoSourceGroup[], endpoint?: string): Ssrc {
  return generateSsrc(type, source, endpoint);
}

export function generateSelfVideo(source: Ssrc, audioSource?: number): GroupCallParticipantVideo {
  return source && {
    _: 'groupCallParticipantVideo',
    pFlags: {},
    endpoint: '',
    source_groups: source.sourceGroups,
    audio_source: audioSource
  };
}

export class GroupCallsController extends EventListenerBase<{
  instance: (instance: GroupCallInstance) => void
}> {
  private audioAsset: ReturnType<typeof getGroupCallAudioAsset>;
  private log: ReturnType<typeof logger>;
  private currentGroupCall: GroupCallInstance;
  private managers: AppManagers;

  public construct(managers: AppManagers) {
    this.managers = managers;
    this.audioAsset = getGroupCallAudioAsset();
    this.log = logger('GCC');

    rootScope.addEventListener('group_call_update', (groupCall) => {
      const {currentGroupCall} = this;
      if(currentGroupCall?.id === groupCall.id) {
        currentGroupCall.groupCall = groupCall;

        if(groupCall._ === 'groupCallDiscarded') {
          currentGroupCall.hangUp(false, false, true);
        }
      }
    });

    rootScope.addEventListener('group_call_participant', ({groupCallId, participant}) => {
      const {currentGroupCall} = this;
      if(currentGroupCall?.id === groupCallId) {
        currentGroupCall.onParticipantUpdate(participant/* , this.doNotDispatchParticipantUpdate */);
      }
    });
  }

  get groupCall() {
    return this.currentGroupCall;
  }

  public setCurrentGroupCall(groupCall: GroupCallInstance) {
    this.currentGroupCall = groupCall;

    if(groupCall) {
      this.dispatchEvent('instance', groupCall);
    }
  }

  public startConnectingSound() {
    this.stopConnectingSound();
    this.audioAsset.playSoundWithTimeout('group_call_connect.mp3', true, 2500);
  }

  public stopConnectingSound() {
    this.audioAsset.stopSound();
    this.audioAsset.cancelDelayedPlay();
  }

  public async joinGroupCall(chatId: ChatId, groupCallId: GroupCallId, muted = IS_MUTED, rejoin?: boolean, joinVideo?: boolean) {
    this.audioAsset.createAudio();

    this.log(`joinGroupCall chatId=${chatId} id=${groupCallId} muted=${muted} rejoin=${rejoin}`);

    let streamManager: StreamManager;
    if(rejoin) {
      streamManager = this.currentGroupCall.connections.main.streamManager;
    } else {
      streamManager = await createMainStreamManager(muted, joinVideo);
    }

    return this.joinGroupCallInternal(chatId, groupCallId, streamManager, muted, rejoin, joinVideo)
    .then(() => {
      // have to refresh participants because of the new connection
      const {currentGroupCall} = this;
      currentGroupCall.participants.then((participants) => {
        if(this.currentGroupCall !== currentGroupCall || currentGroupCall.state === GROUP_CALL_STATE.CLOSED) {
          return;
        }

        participants.forEach((participant) => {
          if(!participant.pFlags.self) {
            currentGroupCall.onParticipantUpdate(participant);
          }
        });
      });
    });
  }

  private async joinGroupCallInternal(chatId: ChatId, groupCallId: GroupCallId, streamManager: StreamManager, muted: boolean, rejoin = false, joinVideo?: boolean) {
    const log = this.log.bindPrefix('joinGroupCallInternal');
    log('start', groupCallId);

    const type: GroupCallConnectionType = 'main';

    let {currentGroupCall} = this;
    if(currentGroupCall && rejoin) {
      // currentGroupCall.connections.main.connection = connection;
      currentGroupCall.handleUpdateGroupCallParticipants = false;
      currentGroupCall.updatingSdp = false;
      log('update currentGroupCall', groupCallId, currentGroupCall);
    } else {
      currentGroupCall = new GroupCallInstance({
        chatId,
        id: groupCallId,
        managers: this.managers
      });

      currentGroupCall.fixSafariAudio();

      currentGroupCall.addEventListener('state', (state) => {
        if(this.currentGroupCall === currentGroupCall && state === GROUP_CALL_STATE.CLOSED) {
          this.setCurrentGroupCall(null);
          this.stopConnectingSound();
          this.audioAsset.playSound('group_call_end.mp3');
          rootScope.dispatchEvent('chat_update', currentGroupCall.chatId);
        }
      });

      currentGroupCall.groupCall = await this.managers.appGroupCallsManager.getGroupCallFull(groupCallId);

      const connectionInstance = currentGroupCall.createConnectionInstance({
        streamManager,
        type,
        options: {
          type,
          isMuted: muted,
          joinVideo,
          rejoin
        }
      });

      const connection = connectionInstance.createPeerConnection();
      connection.addEventListener('negotiationneeded', () => {
        connectionInstance.negotiate();
      });

      connection.addEventListener('track', (event) => {
        log('ontrack', event);
        currentGroupCall.onTrack(event);
      });

      connection.addEventListener('iceconnectionstatechange', () => {
        currentGroupCall.dispatchEvent('state', currentGroupCall.state);

        const {iceConnectionState} = connection;
        if(iceConnectionState === 'disconnected' || iceConnectionState === 'checking' || iceConnectionState === 'new') {
          this.startConnectingSound();
        } else {
          this.stopConnectingSound();
        }

        switch(iceConnectionState) {
          case 'checking': {
            break;
          }

          case 'closed': {
            currentGroupCall.hangUp();
            break;
          }

          case 'completed': {
            break;
          }

          case 'connected': {
            if(!currentGroupCall.joined) {
              currentGroupCall.joined = true;
              this.audioAsset.playSound('group_call_start.mp3');
              this.managers.appGroupCallsManager.getGroupCallParticipants(groupCallId);
            }

            break;
          }

          case 'disconnected': {
            break;
          }

          case 'failed': {
            // TODO: replace with ICE restart
            currentGroupCall.hangUp();
            // connection.restartIce();
            break;
          }

          case 'new': {
            break;
          }
        }
      });

      connectionInstance.createDescription();
      connectionInstance.createDataChannel();

      connectionInstance.appendStreamToConference();

      this.setCurrentGroupCall(currentGroupCall);
      log('set currentGroupCall', groupCallId, currentGroupCall);

      this.startConnectingSound();

      return connectionInstance.negotiate();
    }
  }
}

const groupCallsController = new GroupCallsController();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.groupCallController = groupCallsController);
export default groupCallsController;
