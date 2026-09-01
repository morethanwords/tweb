import {IS_SAFARI} from '@environment/userAgent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {getAppWindow} from '@helpers/appWindow';
import {videoToImage} from '@helpers/dom/videoToImage';
import ListLoader from '@helpers/listLoader';
import ListenerSetter from '@helpers/listenerSetter';
import rtmpCallsController, {RtmpCallInstance} from '@lib/calls/rtmpCallsController';
import apiManagerProxy from '@lib/apiManagerProxy';
import {getRtmpShareUrl, getRtmpStreamUrl} from '@lib/rtmp/url';
import AppMediaViewerBase from '@components/mediaViewer/base';
import {RtmpStartStreamPopup} from '@components/rtmp/adminPopup';
import showOutputDevicePopup from '@components/rtmp/outputDevicePopup';
import {RtmpRecordPopup} from '@components/rtmp/recordPopup';
import PopupElement from '@components/popups';
import SetTransition from '@components/singleTransition';
import {toastNew} from '@components/toast';
import safePlay from '@helpers/dom/safePlay';
import {NULL_PEER_ID} from '@appManagers/constants';
import {render} from 'solid-js/web';
import {AdminStreamPopup} from '@components/rtmp/adminStreamPopup';
import ProgressivePreloader from '@components/preloader';
import RTMP_STATE from '@lib/calls/rtmpState';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {ExportedChatInvite} from '@layer';
import rootScope from '@lib/rootScope';
import shareUrlToPeers from '@components/popups/shareUrl';

const REJOIN_INTERVAL = 15000;

export class AppMediaViewerRtmp extends AppMediaViewerBase<never, 'forward', never> {
  static activeInstance: AppMediaViewerRtmp;
  static previousPeerId: PeerId = NULL_PEER_ID;
  static previousCapture: string;
  private static closeCaptureGeneration = 0;

  private peerId: PeerId;
  private joinedCall: RtmpCallInstance;
  private closePromise?: Promise<void>;
  private listenerSetter = new ListenerSetter();
  private retryTimeout?: number;
  private retryTempId?: number;
  private rejoinInterval?: number;

  private preloaderRtmp: ProgressivePreloader;
  private preloaderTemplate: HTMLElement;

  constructor(private shareUrl: string) {
    super(new ListLoader({
      loadMore: async() => {
        return {
          count: 0,
          items: []
        };
      }
    }), shareUrl ? ['forward'] : []);

    this.preloaderRtmp = new ProgressivePreloader({
      cancelable: false,
      rtmp: true
    });
    this.preloaderRtmp.construct();
    this.preloaderTemplate = document.createElement('div');
    this.preloaderTemplate.classList.add('preloader-template');

    this.retryTempId = 0;

    if(this.shareUrl) this.setBtnMenuToggle([{
      icon: 'forward',
      text: 'Forward',
      onClick: this.onForward
    }]);

    this.buttons.download.classList.add('hide');
    this.buttons.zoomin.classList.add('hide');

    this.wholeDiv.classList.add('live');

    this.setListeners();
  }

  protected setListeners() {
    super.setListeners();

    attachClickEvent(this.buttons.forward, this.onForward, {listenerSetter: this.listenerSetter});

    this.listenerSetter.add(apiManagerProxy.serviceMessagePort)('rtmpStreamDestroyed', (callId) => {
      const joinedCall = this.joinedCall;
      if(joinedCall && rtmpCallsController.currentCall === joinedCall && joinedCall.call.id === callId) {
        this.retryLoadStream(this.videoPlayer.video, 'was destroyed');
      }
    });
  }

  private onForward = async() => {
    shareUrlToPeers({
      url: this.shareUrl,
      multiSelect: true,
      toastKey: 'InviteLinkSentSingle',
      toastKeyForMany: 'InviteLinkSentMany'
    });
  };

  public async openMedia(params: {
    peerId: PeerId,
    isAdmin: boolean
  }) {
    const chatId = params.peerId.toChatId();
    if(!rtmpCallsController.currentCall || rtmpCallsController.currentCall.peerId !== params.peerId) {
      if(rtmpCallsController.currentCall) {
        await rtmpCallsController.leaveCall();
      }

      await rtmpCallsController.joinCall(chatId);
    }

    const joinedCall = rtmpCallsController.currentCall;
    if(!joinedCall || joinedCall.peerId !== params.peerId) {
      throw new Error('RTMP call changed while opening its viewer');
    }

    this.joinedCall = joinedCall;
    AppMediaViewerRtmp.activeInstance = this;
    this.peerId = params.peerId;

    const chat = apiManagerProxy.getChat(chatId);
    if(!getPeerActiveUsernames(chat)[0]) {
      const chatFull = await this.managers.appProfileManager.getChatFull(chatId);
      this.shareUrl = chatFull._ === 'communityFull' ?
        undefined :
        (chatFull.exported_invite as ExportedChatInvite.chatInviteExported)?.link;
    } else {
      this.shareUrl = getRtmpShareUrl(this.peerId);
    }

    this.assertOpeningCall(joinedCall);

    await this._openMedia({
      media: joinedCall.inputCall,
      mediaThumbnail: params.peerId === AppMediaViewerRtmp.previousPeerId ? AppMediaViewerRtmp.previousCapture : undefined,
      timestamp: 0,
      fromId: params.peerId,
      fromRight: 0,
      setupPlayer: (player, readyPromise) => {
        const video = player.video;

        const getCall = () => rtmpCallsController.currentCall === joinedCall ? joinedCall : undefined;

        player.updateLiveViewersCount(joinedCall.call.participants_count);
        if(!IS_SAFARI || params.isAdmin) {
          player.setupLiveMenu([{
            icon: 'volume_up_filled',
            text: 'Rtmp.MediaViewer.Menu.OutputDevice',
            onClick: () => showOutputDevicePopup({
              kind: 'audiooutput',
              currentId: player.video.sinkId || '',
              titleLangKey: 'Rtmp.OutputPopup.Title',
              onPick: (deviceId) => player.video.setSinkId(deviceId)
            }),
            verify: () => typeof(navigator.mediaDevices?.enumerateDevices) === 'function' && !IS_SAFARI
          }, {
            icon: 'radioon',
            text: 'Rtmp.MediaViewer.Menu.StartRecording',
            verify: () => getCall()?.admin && !getCall().call.pFlags.record_video_active,
            onClick: () => PopupElement.createPopup(RtmpRecordPopup).show()
          }, {
            icon: 'radiooff',
            text: 'Rtmp.MediaViewer.Menu.StopRecording',
            verify: () => getCall()?.admin && getCall().call.pFlags.record_video_active,
            onClick: () => {
              const call = getCall();
              if(!call) return;
              this.managers.appGroupCallsManager.stopRecording(call.inputCall).catch(() => {
                toastNew({
                  langPackKey: 'Error.AnError'
                });
              });
            }
          }, {
            icon: 'settings',
            text: 'Rtmp.MediaViewer.Menu.StreamSettings',
            verify: () => getCall()?.admin,
            onClick: () => {
              PopupElement.createPopup(RtmpStartStreamPopup, {
                peerId: this.peerId,
                active: true,
                onEndStream: () => this.close(undefined, true)
              }).show();
            }
          }, {
            icon: 'crossround',
            text: 'Rtmp.MediaViewer.Menu.EndLiveStream',
            danger: true,
            verify: () => getCall()?.admin,
            onClick: () => this.close(undefined, true)
          }]);
        }

        // const onEnded = () => {
        //   this.retryLoadStream(video, 'video ended');
        // };

        // const onError = () => {
        //   if(!video.error) return;
        //   this.retryLoadStream(video, 'video error=' + video.error.message);
        // };

        const onPause = () => {
          if(!video.error && !video.ended) {
            safePlay(video);
          }
        };

        this.listenerSetter.add(video)('pause', onPause);
        // this.listenerSetter.add(video)('error', onError);
        // this.listenerSetter.add(video)('ended', onEnded);

        const selector = 'canvas.canvas-thumbnail, .thumbnail-avatar';
        const thumbnail = this.content.mover.querySelector(selector) as HTMLElement;
        video.after(thumbnail);

        const emptyPipVideoSource = thumbnail.tagName === 'CANVAS' ? thumbnail : this.content.mover.querySelector('img');
        player.emptyPipVideoSource = emptyPipVideoSource as HTMLCanvasElement | HTMLImageElement;

        readyPromise.then(() => {
          player.dimBackground();
        });
      },
      onMoverSet: () => {
        if(!params.isAdmin) {
          return;
        }

        const adminPanelContainer = document.createElement('div');
        adminPanelContainer.classList.add('admin-popup-container');

        this.adminPanel = adminPanelContainer;
        this.adminPanel.classList.add('admin-hidden');

        this.disposeSolid = render(() => AdminStreamPopup({peerId: params.peerId}), this.adminPanel);
      },
      onCanPlay: () => {
        // this.showLoader();
        // return;

        const thumbnail = this.content.mover.querySelector('canvas.canvas-thumbnail, .thumbnail-avatar') as HTMLElement;

        if(!this.streamEnded) {
          this.preloaderRtmp.detach();
        }

        this.videoPlayer.liveEl.classList.add('is-not-buffering');

        if(params.isAdmin) {
          SetTransition({
            element: this.adminPanel,
            className: 'is-not-buffering',
            forwards: true,
            duration: 300
          });
        }

        SetTransition({
          element: thumbnail,
          className: 'hide-thumbnail',
          forwards: true,
          duration: 300
        });

        if(rtmpCallsController.currentCall === joinedCall) {
          joinedCall.state = RTMP_STATE.PLAYING;
        }
      },
      onBuffering: this.showLoader
    });

    // getChatFull and _openMedia both cross asynchronous boundaries before the
    // currentCallChanged listener exists. A replacement during either await
    // must fail this transaction so its owner closes the partially-open viewer
    // without touching the newer call.
    this.assertOpeningCall(joinedCall);

    this.listenerSetter.add(rtmpCallsController)('currentCallChanged', (call) => {
      if(call !== joinedCall) {
        void this.closeWithoutLeaving().catch((err) => {
          this.log.error('closing replaced RTMP viewer failed', err);
        });
        return;
      }

      this.videoPlayer?.updateLiveViewersCount(call.call.participants_count);
    });

    this.rejoinInterval = window.setTimeout(this.rejoin, REJOIN_INTERVAL);
  }

  private assertOpeningCall(joinedCall: RtmpCallInstance): void {
    if(this.closePromise ||
      AppMediaViewerRtmp.activeInstance !== this ||
      rtmpCallsController.currentCall !== joinedCall) {
      throw new Error('RTMP call changed while opening its viewer');
    }
  }

  private rejoin = () => {
    const joinedCall = this.joinedCall;
    if(this.closePromise || rtmpCallsController.currentCall !== joinedCall) return;

    void rtmpCallsController.rejoinCall().catch((err) => {
      this.log.error('rejoinCall', err);
    }).then(() => {
      if(this.closePromise || rtmpCallsController.currentCall !== joinedCall) return;
      this.rejoinInterval = window.setTimeout(this.rejoin, REJOIN_INTERVAL);
    });
  };

  private toggleAdminPanel(visible: boolean) {
    if(visible && this.videoPlayer) {
      this.videoPlayer.cancelFullScreen();
      if(this.videoPlayer.inPip) {
        this.exitPictureInPicture('closing RTMP admin-panel picture-in-picture failed');
      }
    }

    this.videoPlayer?.lockControls(visible ? true : undefined);
    SetTransition({
      element: this.adminPanel,
      className: 'admin-hidden',
      forwards: !visible,
      duration: 300
    });
  }

  private showLoader = () => {
    if(rtmpCallsController.currentCall !== this.joinedCall) return;

    this.videoPlayer.video.parentElement.classList.add('is-buffering');

    if(!this.preloaderTemplate.parentElement) {
      const thumbnail = this.content.mover.querySelector('canvas.canvas-thumbnail, .thumbnail-avatar') as HTMLElement;
      thumbnail.after(this.preloaderTemplate, this.adminPanel);
    }

    this.preloaderRtmp.attach(this.preloaderTemplate, true);

    const liveEl = this.content.mover.querySelector('.controls-live') as HTMLElement;
    liveEl.classList.remove('is-not-buffering');

    this.joinedCall.state = RTMP_STATE.BUFFERING;
  };

  private retryLoadStream(video: HTMLVideoElement, reason: string) {
    const tempId = ++this.retryTempId;
    const log = this.log.bindPrefix(`retryLoadStream-${tempId}-${reason}`);
    const joinedCall = this.joinedCall;
    if(!joinedCall || rtmpCallsController.currentCall !== joinedCall) {
      this.close(undefined, true);
      return;
    }

    let isFirst = true;
    let checkJoined = true;
    let errors = 0;

    const check = () => tempId === this.retryTempId;

    const retry = () => {
      if(!check()) {
        return;
      }

      clearTimeout(this.retryTimeout);

      rtmpCallsController.isCurrentCallDead(checkJoined).then((empty) => {
        if(rtmpCallsController.currentCall !== joinedCall || !check()) {
          // destroyed
          return;
        }

        log('empty', empty, isFirst, checkJoined);
        checkJoined = empty === 'dying';

        if(empty === 'dead' || empty === 'dying') {
          if(isFirst) {
            this.showLoader();
            if(rtmpCallsController.currentCall?.admin) {
              this.toggleAdminPanel(true);
            }
            if(IS_SAFARI) {
              // если не сделать этого то сафари продолжит пытаться достучаться
              apiManagerProxy.serviceMessagePort.invokeVoid('leaveRtmpCall', [rtmpCallsController.currentCall.call.id, false]);
            }
          }
          isFirst = false;
          this.retryTimeout = window.setTimeout(retry, 1000);
          return;
        }

        if(joinedCall.admin) {
          this.toggleAdminPanel(false);
        }

        const url = getRtmpStreamUrl(joinedCall.inputCall);
        if(video.getAttribute('src') !== url) {
          video.src = url;
          video.load();
          safePlay(video);
        }
      }).catch((err) => {
        if(rtmpCallsController.currentCall !== joinedCall || !check()) {
          // destroyed
          return;
        }

        if(++errors > 5) {
          log.error(err);
          toastNew({
            langPackKey: 'Error.AnError'
          });
          this.close(undefined, true);
        } else {
          this.retryTimeout = window.setTimeout(retry, 1000);
        }
      })
    }

    retry();
  }

  private async leaveCall(discard = false, expectedCall = this.joinedCall): Promise<void> {
    await rtmpCallsController.leaveCall(discard, expectedCall).catch(() => {
      toastNew({
        langPackKey: 'Error.AnError'
      });
    });
  }

  public isAttachedToCall(call: RtmpCallInstance): boolean {
    return this.joinedCall === call;
  }

  public closeWithoutLeaving(): Promise<void> {
    return this.close(undefined, false, true);
  }

  public close(e?: MouseEvent, end = false, skipLeave = false): Promise<void> {
    if(this.closePromise) return this.closePromise;

    const joinedCall = this.joinedCall;
    const hadPip = this.videoPlayer?.inPip;
    const pipElement = hadPip ? this.videoPlayer?.video : undefined;
    const captureGeneration = ++AppMediaViewerRtmp.closeCaptureGeneration;

    clearTimeout(this.retryTimeout);
    clearTimeout(this.rejoinInterval);
    ++this.retryTempId;

    if(AppMediaViewerRtmp.activeInstance === this) {
      AppMediaViewerRtmp.activeInstance = undefined;
    }
    this.listenerSetter.removeAll();

    return this.closePromise = this.closeInternal({
      captureGeneration,
      e,
      end,
      hadPip,
      joinedCall,
      pipElement,
      skipLeave
    });
  }

  private async closeInternal(options: {
    captureGeneration: number,
    e?: MouseEvent,
    end: boolean,
    hadPip: boolean,
    joinedCall?: RtmpCallInstance,
    pipElement?: HTMLVideoElement,
    skipLeave: boolean
  }): Promise<void> {
    const {captureGeneration, e, end, hadPip, joinedCall, pipElement, skipLeave} = options;

    let capturePromise: Promise<Blob> | undefined;
    if(this.videoPlayer) {
      try {
        // videoToImage snapshots the current frame synchronously and only then
        // awaits canvas encoding. Start that work before closing the DOM, but do
        // not keep an old viewer layered over its replacement while encoding.
        capturePromise = videoToImage(this.videoPlayer.video);
      } catch(e) {}
    }

    let baseClose: ReturnType<AppMediaViewerRtmp['close']> | undefined;
    try {
      baseClose = super.close(e) as Promise<void>;
    } catch(err) {
      this.log.error('closing RTMP media viewer failed', err);
    }

    const leavePromise = joinedCall && !skipLeave ? this.leaveCall(end, joinedCall) : Promise.resolve();

    if(capturePromise) {
      try {
        const capturedBlob = await capturePromise;
        if(captureGeneration === AppMediaViewerRtmp.closeCaptureGeneration) {
          const capture = URL.createObjectURL(capturedBlob);
          if(AppMediaViewerRtmp.previousCapture) {
            URL.revokeObjectURL(AppMediaViewerRtmp.previousCapture);
          }
          AppMediaViewerRtmp.previousCapture = capture;
          AppMediaViewerRtmp.previousPeerId = this.peerId;
        }
      } catch(e) {}
    }

    await leavePromise;

    const appDocument = getAppWindow().document;
    if(hadPip && pipElement && appDocument.pictureInPictureElement === pipElement) {
      await appDocument.exitPictureInPicture().catch((err) => {
        this.log.error('exit RTMP picture-in-picture failed', err);
      });
    }

    await Promise.resolve(baseClose).catch((err) => {
      this.log.error('closing RTMP media viewer failed', err);
    });
  }

  public static closeActivePip(end = false) {
    if(!AppMediaViewerRtmp.activeInstance) return;

    if(AppMediaViewerRtmp.activeInstance.videoPlayer?.inPip) {
      AppMediaViewerRtmp.activeInstance.exitPictureInPicture('closing active RTMP picture-in-picture failed');
    }
  }

  private exitPictureInPicture(context: string): void {
    void getAppWindow().document.exitPictureInPicture().catch((err) => {
      this.log.error(context, err);
    });
  }

  public static async getShareUrl(chatId: ChatId) {
    const chat = apiManagerProxy.getChat(chatId);
    if(!getPeerActiveUsernames(chat)[0]) {
      const chatFull = await rootScope.managers.appProfileManager.getChatFull(chatId);
      return chatFull._ === 'communityFull' ?
        undefined :
        (chatFull.exported_invite as ExportedChatInvite.chatInviteExported)?.link;
    } else {
      return getRtmpShareUrl(chatId.toPeerId(true));
    }
  }
}
