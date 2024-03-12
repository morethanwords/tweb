import {Show, createEffect, createMemo, createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {TopbarLive} from './topbarLive';
import {useChat} from '../../../helpers/solid/useCurrentChat';
import {subscribeOn} from '../../../helpers/solid/subscribeOn';
import rootScope from '../../../lib/rootScope';
import rtmpCallsController from '../../../lib/calls/rtmpCallsController';
import {useCurrentRtmpCall} from '../../rtmp/hooks';
import {AppMediaViewerRtmp} from '../../appMediaViewerRtmp';
import {toastNew} from '../../toast';
import PinnedContainer from '../pinnedContainer';
import {AppManagers} from '../../../lib/appManagers/managers';
import Chat from '../chat';
import ChatTopbar from '../topbar';
import {NULL_PEER_ID} from '../../../lib/mtproto/mtproto_config';
import {Chat as MTChat} from '../../../layer';

export default class ChatLive extends PinnedContainer {
  private dispose: () => void;
  private peerId: () => PeerId;
  public setPeerId: (peerId: PeerId) => void;

  constructor(protected topbar: ChatTopbar, protected chat: Chat, protected managers: AppManagers) {
    super({
      topbar,
      chat,
      listenerSetter: topbar.listenerSetter,
      className: 'live',
      floating: true
    });

    [this.peerId, this.setPeerId] = createSignal<PeerId>(NULL_PEER_ID);
    this.dispose = render(() => this.init(), this.container);
  }

  private init() {
    const {peerId} = this;

    const [watching, setWatching] = createSignal<number | undefined>(undefined);
    const chat = useChat(() => peerId().toChatId());
    const currentCall = useCurrentRtmpCall();
    const isGroupCallActive = createMemo(() => {
      if(peerId().isUser()) return false;
      const _chat = chat();

      return !!(
        (_chat as MTChat.channel).pFlags.broadcast &&
        (_chat as MTChat.channel).pFlags.call_active &&
        (_chat as MTChat.channel).pFlags.call_not_empty
      );
    });
    const shouldShow = createMemo(() => isGroupCallActive() && currentCall.peerId() !== peerId());

    const getFullChat = () => rootScope.managers.appProfileManager.getChatFull(peerId().toChatId());

    subscribeOn(rootScope)('group_call_update', async(call) => {
      if(!isGroupCallActive() || call._ !== 'groupCall') return;
      const fullChat = await getFullChat();
      if(fullChat?._ !== 'channelFull') return;

      if(call.id !== fullChat.call?.id) return;

      setWatching(call.participants_count);
    });

    createEffect(() => {
      if(!peerId()) {
        return;
      }

      setWatching();

      createEffect(async() => {
        if(!isGroupCallActive()) {
          setWatching();
        }

        const fullChat = await getFullChat();
        if(fullChat?._ !== 'channelFull' || !fullChat.call) return;

        const call = await rootScope.managers.appGroupCallsManager.getGroupCallFull(fullChat.call.id);
        if(call?._ !== 'groupCall') return;

        setWatching(call.participants_count);
      });
    });

    subscribeOn(rtmpCallsController)('currentCallChanged', (call) => {
      if(call?.peerId === peerId()) {
        openPlayer();
      }
    });

    subscribeOn(rtmpCallsController)('pipToggled', (enabled) => {
      if(!enabled) {
        openPlayer();
      }
    });

    createEffect(() => {
      this.toggle(!shouldShow());
    });

    const openPlayer = () => {
      if(AppMediaViewerRtmp.activeInstance) return;

      new AppMediaViewerRtmp().openMedia({
        peerId: peerId(),
        isAdmin: currentCall.call().admin
      });
    };
    const onJoinClicked = async() => {
      if(rtmpCallsController.currentCall) return;

      await rtmpCallsController.joinCall(peerId().toChatId()).catch((err) => {
        console.error(err);
        toastNew({
          langPackKey: 'Error.AnError'
        });
      });
    };

    return (
      <Show when={shouldShow()}>
        <TopbarLive
          watching={watching()}
          animationTrigger={peerId}
          onJoin={onJoinClicked}
        />
      </Show>
    );
  }

  public destroy() {
    super.destroy();
    this.dispose();
  }
}
