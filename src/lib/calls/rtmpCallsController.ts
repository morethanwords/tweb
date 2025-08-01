import {MOUNT_CLASS_TO} from '../../config/debug';
import EventListenerBase from '../../helpers/eventListenerBase';
import {nextRandomUint} from '../../helpers/random';
import {DataJSON, GroupCall, InputGroupCall} from '../../layer';
import {JoinGroupCallJsonPayload} from '../appManagers/appGroupCallsManager';
import {AppManagers} from '../appManagers/managers';
import apiManagerProxy from '../mtproto/mtprotoworker';
import rootScope from '../rootScope';
import {RTMP_UNIFIED_CHANNEL_ID, RTMP_UNIFIED_QUALITY} from './constants';
import RTMP_STATE from './rtmpState';

export class RtmpCallInstance extends EventListenerBase<{
  state: (state: RTMP_STATE) => void
}> {
  public chatId: ChatId;
  public peerId: PeerId;
  public call: GroupCall.groupCall;
  public inputCall: InputGroupCall.inputGroupCall;
  public ssrc: number;
  public pip: boolean;
  public admin: boolean;
  public lastKnownTime: string;

  private _state: RTMP_STATE;

  constructor(params: {
    chatId: ChatId,
    peerId: PeerId,
    call: GroupCall.groupCall,
    inputCall: InputGroupCall.inputGroupCall,
    ssrc: number,
    pip: boolean,
    admin: boolean,
    lastKnownTime: string
  }) {
    super(false);
    Object.assign(this, params);
    this._state = RTMP_STATE.CONNECTING;
  }

  public cleanup() {
    super.cleanup();
  }

  public get state() {
    return this._state;
  }

  public set state(value: RTMP_STATE) {
    this._state = value;
    this.dispatchEvent('state', value);
  }
}

export class RtmpCallsController extends EventListenerBase<{
  startedJoining: (peerId: PeerId) => void,
  currentCallChanged: (call: RtmpCallInstance) => void
}> {
  private managers: AppManagers;

  private _currentCall: RtmpCallInstance;

  public construct(managers: AppManagers) {
    this.managers = managers;

    rootScope.addEventListener('group_call_update', this.onGroupCallUpdate);

    apiManagerProxy.serviceMessagePort.addEventListener('rtmpStreamTime', ({callId, time}) => {
      if(this.currentCall?.call.id === callId) {
        this.currentCall.lastKnownTime = time;
      }
    });
  }

  public get currentCall() {
    return this._currentCall;
  }

  private set currentCall(value: RtmpCallInstance | undefined) {
    if(this.currentCall === value) {
      return;
    }

    this._currentCall?.cleanup();
    this.dispatchEvent('currentCallChanged', this._currentCall = value);
  }

  private onGroupCallUpdate = (update: GroupCall) => {
    if(update.id !== this.currentCall?.call.id) return;

    if(update._ === 'groupCallDiscarded') {
      this.currentCall = undefined;
      return;
    }

    this.currentCall.call = update;
    this.dispatchEvent('currentCallChanged', this.currentCall);
  };

  private randomSsrc() {
    // random signed int32
    return (Math.random() < 0.5 ? -1 : 1) * nextRandomUint(16);
  }

  private getJoinPayload(ssrc: number): DataJSON {
    const innerData: JoinGroupCallJsonPayload = {
      'fingerprints': [],
      'pwd': '',
      'ssrc': ssrc,
      'ssrc-groups': [],
      'ufrag': ''
    };

    return {
      _: 'dataJSON',
      data: JSON.stringify(innerData)
    };
  }

  public async joinCall(chatId: ChatId) {
    if(this.currentCall) {
      throw new Error('Already in rtmp call');
    }

    const peerId = chatId.toPeerId(true);
    this.dispatchEvent('startedJoining', peerId);

    const ssrc = this.randomSsrc();
    const data = this.getJoinPayload(ssrc);

    const chat = await this.managers.appProfileManager.getChatFull(chatId);
    if(chat._ !== 'channelFull') {
      throw new Error('Not a chat');
    }

    const callId = (chat.call as InputGroupCall.inputGroupCall)?.id;
    if(!callId) {
      throw new Error('No call id');
    }

    const call = await this.managers.appGroupCallsManager.getGroupCallFull(callId);
    if(call._ !== 'groupCall') {
      throw new Error('Not a group call');
    }

    const update = await this.managers.appGroupCallsManager.joinGroupCall(callId, data, {type: 'main'});
    const updateData = JSON.parse(update.params.data);
    if(updateData.rtmp !== true) {
      throw new Error('Not an rtmp call');
    }

    this.currentCall = new RtmpCallInstance({
      call,
      inputCall: {
        _: 'inputGroupCall',
        id: call.id,
        access_hash: call.access_hash
      },
      chatId,
      peerId,
      ssrc,
      pip: false,
      admin: Boolean(chat.pFlags?.can_delete_channel),
      lastKnownTime: '0'
    });
  }

  public async leaveCall(discard = false) {
    if(!this.currentCall) return;
    const currentCall = this.currentCall;

    this.currentCall = undefined;
    apiManagerProxy.serviceMessagePort.invokeVoid('leaveRtmpCall', [currentCall.call.id, true]);
    await this.managers.appGroupCallsManager.hangUp(currentCall.call.id, discard ? true : currentCall.ssrc);
  }

  public async isCurrentCallDead(checkJoined = false, triedRejoin = false): Promise<'dead' | 'dying' | 'alive'> {
    if(!this.currentCall) return 'dead';

    const state = await this.managers.appGroupCallsManager.fetchRtmpState(this.currentCall.inputCall);
    if(!checkJoined) return state.channels.length === 0 ? 'dead' : 'alive';

    // check if we are joined by trying to fetch a part
    const unified = state.channels.find((it) => it.channel === RTMP_UNIFIED_CHANNEL_ID);
    if(!unified) return 'dead';
    try {
      const time = this.currentCall.lastKnownTime === '0' ? unified.last_timestamp_ms : this.currentCall.lastKnownTime;
      await this.managers.appGroupCallsManager.fetchRtmpPart({
        _: 'inputGroupCallStream',
        call: this.currentCall.inputCall,
        video_channel: RTMP_UNIFIED_CHANNEL_ID,
        video_quality: RTMP_UNIFIED_QUALITY,
        scale: unified.scale,
        time_ms: time
      }, state.dcId);
      return 'alive';
    } catch(e) {
      if((e as ApiError).type === 'GROUPCALL_JOIN_MISSING' && !triedRejoin) {
        try {
          await this.rejoinCall();
          return this.isCurrentCallDead(true, true);
        } catch(e) {}
      }
    }

    return 'dying';
  }

  public async rejoinCall() {
    if(!this.currentCall) return;
    this.currentCall.ssrc = this.randomSsrc();
    const data = this.getJoinPayload(this.currentCall.ssrc);
    await this.managers.appGroupCallsManager.joinGroupCall(this.currentCall.call.id, data, {type: 'main'});
  }
}

const rtmpCallsController = new RtmpCallsController();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.rtmpCallsController = rtmpCallsController);
export default rtmpCallsController;
