import {Show, createEffect, createMemo, createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {TopbarLive} from './topbarLive';
import {subscribeOn} from '../../../helpers/solid/subscribeOn';
import rootScope from '../../../lib/rootScope';
import {useCurrentRtmpCall} from '../../rtmp/hooks';
import PinnedContainer from '../pinnedContainer';
import {AppManagers} from '../../../lib/appManagers/managers';
import Chat from '../chat';
import ChatTopbar from '../topbar';
import {NULL_PEER_ID} from '../../../lib/mtproto/mtproto_config';
import {Chat as MTChat} from '../../../layer';
import appImManager from '../../../lib/appManagers/appImManager';
import {useChat} from '../../../stores/peers';

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
      floating: true,
      height: 56
    });

    [this.peerId, this.setPeerId] = createSignal<PeerId>(NULL_PEER_ID);
    this.dispose = render(() => this.init(), this.container);
  }

  private init() {
    const {peerId} = this;

    const [watching, setWatching] = createSignal<number>();
    const chat = useChat(() => peerId().toChatId());
    const currentCall = useCurrentRtmpCall();
    const isGroupCallActive = createMemo(() => {
      const _chat = chat();

      return !!(
        _chat &&
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

    createEffect<PeerId>((wasPeerId) => {
      if(!chat() || !(chat() as MTChat.channel).pFlags.broadcast) {
        return;
      }

      if(wasPeerId !== peerId()) {
        setWatching();
      }

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

      return peerId();
    });

    createEffect(() => {
      this.toggle(!shouldShow());
    });

    const onJoinClicked = () => {
      appImManager.joinLiveStream(peerId());
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
