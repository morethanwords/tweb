import {IS_SAFARI} from '../environment/userAgent';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import {videoToImage} from '../helpers/dom/videoToImage';
import ListLoader from '../helpers/listLoader';
import ListenerSetter from '../helpers/listenerSetter';
import rtmpCallsController from '../lib/calls/rtmpCallsController';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';
import {getRtmpShareUrl, getRtmpStreamUrl} from '../lib/rtmp/url';
import AppMediaViewerBase from './appMediaViewerBase';
import {RtmpStartStreamPopup} from './rtmp/adminPopup';
import {OutputDevicePopup} from './rtmp/outputDevicePopup';
import {RtmpRecordPopup} from './rtmp/recordPopup';
import PopupElement from './popups';
import SetTransition from './singleTransition';
import {toastNew} from './toast';
import safePlay from '../helpers/dom/safePlay';
import {NULL_PEER_ID} from '../lib/mtproto/mtproto_config';
import {render} from 'solid-js/web';
import {AdminStreamPopup} from './rtmp/adminStreamPopup';
import ProgressivePreloader from './preloader';
import RTMP_STATE from '../lib/calls/rtmpState';
import getPeerActiveUsernames from '../lib/appManagers/utils/peers/getPeerActiveUsernames';
import {ExportedChatInvite} from '../layer';
import rootScope from '../lib/rootScope';
import PopupPickUser from './popups/pickUser';
import wrapPeerTitle from './wrappers/peerTitle';
import PaidMessagesInterceptor, {PAYMENT_REJECTED} from './chat/paidMessagesInterceptor';

const REJOIN_INTERVAL = 15000;

export class AppMediaViewerRtmp extends AppMediaViewerBase<never, 'forward', never> {
  static activeInstance: AppMediaViewerRtmp;
  static previousPeerId: PeerId = NULL_PEER_ID;
  static previousCapture: string;

  private peerId: PeerId;
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
      if(rtmpCallsController.currentCall?.call.id === callId) {
        this.retryLoadStream(this.videoPlayer.video, 'was destroyed');
      }
    });
  }

  private onForward = async() => {
    PopupPickUser.createSharingPicker({
      onSelect: async(peerId, _, monoforumThreadId) => {
        const preparedPaymentResult = await PaidMessagesInterceptor.prepareStarsForPayment({messageCount: 1, peerId});
        if(preparedPaymentResult === PAYMENT_REJECTED) throw new Error();

        rootScope.managers.appMessagesManager.sendText({
          peerId,
          replyToMonoforumPeerId: monoforumThreadId,
          text: this.shareUrl,
          confirmedPaymentResult: preparedPaymentResult
        });

        toastNew({
          langPackKey: 'InviteLinkSentSingle',
          langPackArguments: [await wrapPeerTitle({peerId, dialog: true})]
        });
      }
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

    AppMediaViewerRtmp.activeInstance = this;
    this.peerId = params.peerId;

    const chat = apiManagerProxy.getChat(chatId);
    if(!getPeerActiveUsernames(chat)[0]) {
      const chatFull = await this.managers.appProfileManager.getChatFull(chatId);
      this.shareUrl = (chatFull.exported_invite as ExportedChatInvite.chatInviteExported)?.link;
    } else {
      this.shareUrl = getRtmpShareUrl(this.peerId);
    }

    await this._openMedia({
      media: rtmpCallsController.currentCall.inputCall,
      mediaThumbnail: params.peerId === AppMediaViewerRtmp.previousPeerId ? AppMediaViewerRtmp.previousCapture : undefined,
      timestamp: 0,
      fromId: params.peerId,
      fromRight: 0,
      setupPlayer: (player, readyPromise) => {
        const video = player.video;

        const getCall = () => rtmpCallsController.currentCall;

        player.updateLiveViewersCount(getCall().call.participants_count);
        if(!IS_SAFARI || params.isAdmin) {
          player.setupLiveMenu([{
            icon: 'volume_up',
            text: 'Rtmp.MediaViewer.Menu.OutputDevice',
            onClick: () => PopupElement.createPopup(OutputDevicePopup, player.video).show(),
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
              this.managers.appGroupCallsManager.stopRecording(getCall().inputCall).catch(() => {
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

        rtmpCallsController.currentCall.state = RTMP_STATE.PLAYING;
      },
      onBuffering: this.showLoader
    });

    this.listenerSetter.add(rtmpCallsController)('currentCallChanged', (call) => {
      if(!call) {
        this.close(undefined, true);
        return;
      }

      this.videoPlayer?.updateLiveViewersCount(call.call.participants_count);
    });

    this.rejoinInterval = window.setTimeout(this.rejoin, REJOIN_INTERVAL);
  }

  private rejoin = () => {
    if(rtmpCallsController.currentCall) {
      rtmpCallsController.rejoinCall().catch((err) => {
        this.log.error('rejoinCall', err);
      }).then(() => {
        this.rejoinInterval = window.setTimeout(this.rejoin, REJOIN_INTERVAL);
      });
    }
  }

  private toggleAdminPanel(visible: boolean) {
    if(visible && this.videoPlayer) {
      this.videoPlayer.cancelFullScreen();
      if(this.videoPlayer.inPip) {
        document.exitPictureInPicture();
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
    this.videoPlayer.video.parentElement.classList.add('is-buffering');

    if(!this.preloaderTemplate.parentElement) {
      const thumbnail = this.content.mover.querySelector('canvas.canvas-thumbnail, .thumbnail-avatar') as HTMLElement;
      thumbnail.after(this.preloaderTemplate, this.adminPanel);
    }

    this.preloaderRtmp.attach(this.preloaderTemplate, true);

    const liveEl = this.content.mover.querySelector('.controls-live') as HTMLElement;
    liveEl.classList.remove('is-not-buffering');

    rtmpCallsController.currentCall.state = RTMP_STATE.BUFFERING;
  };

  private retryLoadStream(video: HTMLVideoElement, reason: string) {
    const tempId = ++this.retryTempId;
    const log = this.log.bindPrefix(`retryLoadStream-${tempId}-${reason}`);
    const myCallId = rtmpCallsController.currentCall?.call.id;
    if(!myCallId) {
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
        if(rtmpCallsController.currentCall?.call.id !== myCallId || !check()) {
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

        if(rtmpCallsController.currentCall?.admin) {
          this.toggleAdminPanel(false);
        }

        const url = getRtmpStreamUrl(rtmpCallsController.currentCall.inputCall);
        if(video.getAttribute('src') !== url) {
          video.src = url;
          video.load();
          safePlay(video);
        }
      }).catch((err) => {
        if(rtmpCallsController.currentCall?.call.id !== myCallId || !check()) {
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

  private async leaveCall(discard = false) {
    rtmpCallsController.leaveCall(discard).catch(() => {
      toastNew({
        langPackKey: 'Error.AnError'
      });
    });
  }

  public async close(e?: MouseEvent, end = false) {
    const hadPip = this.videoPlayer?.inPip;

    clearTimeout(this.retryTimeout);
    clearTimeout(this.rejoinInterval);
    ++this.retryTempId;

    if(this.videoPlayer) {
      try {
        const capturedBlob = await videoToImage(this.videoPlayer.video);
        if(AppMediaViewerRtmp.previousCapture) {
          URL.revokeObjectURL(AppMediaViewerRtmp.previousCapture);
        }
        AppMediaViewerRtmp.previousCapture = URL.createObjectURL(capturedBlob);
        AppMediaViewerRtmp.previousPeerId = this.peerId;
      } catch(e) {}
    }

    super.close(e);
    AppMediaViewerRtmp.activeInstance = undefined;

    if(rtmpCallsController.currentCall) {
      this.leaveCall(end);
    }

    this.listenerSetter.removeAll();
    if(hadPip) {
      document.exitPictureInPicture();
    }
  }

  public static closeActivePip(end = false) {
    if(!AppMediaViewerRtmp.activeInstance) return;

    if(AppMediaViewerRtmp.activeInstance.videoPlayer?.inPip) {
      document.exitPictureInPicture();
    }
  }

  public static async getShareUrl(chatId: ChatId) {
    const chat = apiManagerProxy.getChat(chatId);
    if(!getPeerActiveUsernames(chat)[0]) {
      const chatFull = await rootScope.managers.appProfileManager.getChatFull(chatId);
      return (chatFull.exported_invite as ExportedChatInvite.chatInviteExported)?.link;
    } else {
      return getRtmpShareUrl(chatId.toPeerId(true));
    }
  }
}
