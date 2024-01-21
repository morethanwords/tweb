import {nextRandomUint} from '../../helpers/random';
import {GroupCall, InputGroupCall, Update, Updates} from '../../layer';
import {AppImManager} from './appImManager';

export class AppStreamManager {
  private appImManager: AppImManager;
  private videoElement: HTMLVideoElement;
  private interval: unknown;
  private ssrc: number;

  constructor() {
    console.warn('AppStreamManager constructor');
  }

  get managers() {
    return this.appImManager.managers;
  }

  public init(manager: AppImManager) {
    this.appImManager = manager;
  }

  public async getRTMPCredentials(peerId: number, revoke: boolean) {
    return this.managers.apiManager.invokeApi('phone.getGroupCallStreamRtmpUrl', {
      peer: await this.managers.appPeersManager.getInputPeerById(peerId),
      revoke
    });
  }

  public async createRTMPStream(peerId: PeerId, title: string) {
    const updates = await this.managers.apiManager.invokeApi('phone.createGroupCall', {
      peer: await this.managers.appPeersManager.getInputPeerById(peerId),
      random_id: nextRandomUint(32),
      title,
      schedule_date: undefined,
      rtmp_stream: true
    });

    console.log(updates);

    this.managers.apiUpdatesManager.processUpdateMessage(updates);

    console.log(updates);


    const update = (updates as Updates.updates).updates.find((update) => update._ === 'updateGroupCall') as Update.updateGroupCall;
    return update.call;
  }

  public async joinRTMPStream(peerId: PeerId, player: HTMLVideoElement, updCount: (val: number) => void) {
    const chatId = peerId.toChatId();
    console.log('started RTMP');
    console.warn(chatId);
    console.warn(peerId);
    const hasRights = await this.managers.appChatsManager.hasRights(chatId, 'manage_call');

    console.warn(hasRights);
    const next = async() => {
      const chatFull = await this.managers.appProfileManager.getChatFull(chatId);

      console.warn(chatFull);
      let call: GroupCall;
      if(!chatFull.call) {
        if(!hasRights) {
          return;
        }

        call = await this.createRTMPStream(peerId, 'cool stream here bro');

        console.log(call);
      } else {
        call = chatFull.call as any;
      }

      const newCall: any = await this.getCallInfo({
        _: 'inputGroupCall',
        id: call.id,
        access_hash: call.access_hash
      });

      const dcId = newCall.call.stream_dc_id as any as number;

      this.ssrc = nextRandomUint(32);
      await this.managers.apiManager.invokeApi('phone.joinGroupCall', {
        call: {
          _: 'inputGroupCall',
          id: call.id,
          access_hash: call.access_hash
        },
        join_as: await this.managers.appPeersManager.getInputPeerSelf(),
        muted: true,
        video_stopped: true,
        params: {
          _: 'dataJSON',
          data: `{"ssrc":${this.ssrc}}`
        }
      }).then(console.warn);

      const mediaSource = new MediaSource();
      player.src = window.URL.createObjectURL(mediaSource);

      mediaSource.addEventListener('sourceended', (...args) => console.log('source ended', ...args));
      mediaSource.addEventListener('sourceclose', (...args) => console.log('source closed', ...args));
      mediaSource.addEventListener('error', (arg1) => console.error('error', arg1));
      mediaSource.addEventListener('updateend', () => {});

      mediaSource.addEventListener('sourceopen', () => {
        const videoBuffer = mediaSource.addSourceBuffer(this.metadata[0].codec);
        const audioBuffer = mediaSource.addSourceBuffer(this.metadata[1].codec);
        videoBuffer.mode = 'sequence';
        audioBuffer.mode = 'sequence';

        // call this but start video after 3-5 seconds
        this.interval = setInterval(() => {
          const input = {
            _: 'inputGroupCall' as const,
            id: call.id,
            access_hash: call.access_hash
          };
          this.getRTMPStreamInfo(dcId, input, videoBuffer, audioBuffer);
          this.getCallInfo(input).then(call => updCount((call.call as GroupCall.groupCall).participants_count || 1));
        }, 1200);
      });
    };

    const man = appStreamManager;
    console.log(man);

    next();
  };

  private metadata = [
    {codec: 'video/mp4; codecs="avc1.64001f"', samples: 30},
    {codec: 'audio/mp4; codecs="opus"', samples: 50}
  ];

  private indexOfSubArray(buffer: Uint8Array, subArray: number[]) {
    for(let i = 0; i <= buffer.length - subArray.length; i++) {
      let found = true;
      for(let j = 0; j < subArray.length; j++) {
        if(buffer[i + j] !== subArray[j]) {
          found = false;
          break;
        }
      }
      if(found) return i;
    }
    return -1; // Not found
  }

  public createBuffer(i: number, buffer: any, sourceBuffer?: SourceBuffer) {
    const mp4boxfile = (window as unknown as {MP4Box: {createFile: () => any}})['MP4Box'].createFile();
    let tempBuffer: ArrayBuffer;
    mp4boxfile.onReady = (info: any) => {
      mp4boxfile.setSegmentOptions(info.tracks[i].id, null, {nbSamples: this.metadata[i].samples});
      const res = mp4boxfile.initializeSegmentation();
      res.forEach((segment: any) => {
        tempBuffer = segment.buffer as ArrayBuffer;
      });
      mp4boxfile.start();
    }

    mp4boxfile.onSegment = (id: number, user: unknown, segmentBuffer: ArrayBuffer, sampleNum: number) => {
      try {
        if(sampleNum === (this.metadata[i].samples)) {
          const newBuf = new Uint8Array(tempBuffer.byteLength + segmentBuffer.byteLength);
          newBuf.set(new Uint8Array(tempBuffer), 0);
          newBuf.set(new Uint8Array(segmentBuffer), tempBuffer.byteLength);
          sourceBuffer.addEventListener('updateend', (wh) => {
            // console.log('update end');
            // console.log(wh);
          });
          sourceBuffer.appendBuffer(newBuf.buffer);
        }
      } catch(e) {
        console.error(e);
      }
    }
    mp4boxfile.appendBuffer(buffer);
    mp4boxfile.flush();
  }

  public async getRTMPStreamInfo(dcId: number, call: InputGroupCall, videoBuffer: SourceBuffer, audioBuffer: SourceBuffer) {
    const strmChnl = await this.managers.apiManager.invokeApi('phone.getGroupCallStreamChannels', {call}, {dcId});
    const {last_timestamp_ms: time_ms, scale, channel: video_channel} = strmChnl.channels[0];

    const data: any = await this.managers.apiManager.invokeApi('upload.getFile', {
      precise: false,
      location: {
        _: 'inputGroupCallStream',
        call: {
          _: 'inputGroupCall',
          id: call.id,
          access_hash: call.access_hash
        },
        time_ms,
        scale,
        video_channel,
        video_quality: 2
      },
      offset: 0,
      limit: 512 * 1024
    }, {dcId});
    const test = (data.bytes.slice(32) as Uint8Array);
    const index = this.indexOfSubArray(test, [100, 79, 112, 115]);
    const datArr = test.subarray(index);
    datArr[5] = 1;
    try {
      const fixedBuffer = test.buffer as unknown as { fileStart: number };
      fixedBuffer['fileStart'] = 0;
      this.createBuffer(0, fixedBuffer, videoBuffer);
      this.createBuffer(1, fixedBuffer, audioBuffer);
    } catch(e) {
      console.warn('error now:');
      console.error(e);
    }
  }

  public async getCallInfo(call: InputGroupCall) {
    const promise = await this.managers.apiManager.invokeApi('phone.getGroupCall', {
      call,
      limit: 100
    });
    console.warn(promise);
    return promise;
  }

  public async getInvite(call: InputGroupCall) {
    const promise = await this.managers.apiManager.invokeApi('phone.exportGroupCallInvite', {call});
    console.log(promise);
    return promise;
  }

  public async toggleRecord(call: InputGroupCall, options: {start: boolean, video?: boolean, title?: string, video_portrait?: boolean}) {
    const promise = await this.managers.apiManager.invokeApi('phone.toggleGroupCallRecord', {call, ...options});
    console.log(promise);
    return promise;
  }

  public async editCallTitle(call: InputGroupCall, title: string) {
    const promise = await this.managers.apiManager.invokeApi('phone.editGroupCallTitle', {call, title});
    console.log(promise);
    return promise;
  }

  public async terminateCallInfo(call: InputGroupCall) {
    clearInterval(this.interval as any);
    const promise = await this.managers.apiManager.invokeApi('phone.discardGroupCall', {call});
    console.log(promise);
    return promise;
  }

  public async leaveStream(call: InputGroupCall) {
    clearInterval(this.interval as any);
    const promise = await this.managers.apiManager.invokeApi('phone.leaveGroupCall', {call, source: this.ssrc});
    console.log(promise);
    return promise;
  }
}

const appStreamManager = new AppStreamManager();
export default appStreamManager;
