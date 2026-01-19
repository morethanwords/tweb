import {Show, createEffect, createMemo, createResource, createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {TopbarLive} from '@components/chat/topbarLive/topbarLive';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import rootScope from '@lib/rootScope';
import {useCurrentRtmpCall} from '@components/rtmp/hooks';
import PinnedContainer from '@components/chat/pinnedContainer';
import {AppManagers} from '@lib/managers';
import Chat from '@components/chat/chat';
import ChatTopbar from '@components/chat/topbar';
import {NULL_PEER_ID} from '@appManagers/constants';
import {ChatFull, GroupCall, InputGroupCall, Chat as MTChat} from '@layer';
import appImManager from '@lib/appImManager';
import {useChat} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';

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
    const [fullPeer, setFullPeer] = createSignal<ChatFull | undefined>();
    createEffect(() => {
      const fullPeer = useFullPeer(peerId());
      createEffect(() => {
        setFullPeer(fullPeer() as ChatFull);
      });
    });
    const currentCall = useCurrentRtmpCall();
    const isCallActive = createMemo(() => {
      const _chat = chat();

      return !!(
        _chat &&
        (_chat as MTChat.channel).pFlags.broadcast &&
        (_chat as MTChat.channel).pFlags.call_active &&
        (_chat as MTChat.channel).pFlags.call_not_empty
      );
    });
    const [fullCall] = createResource(
      fullPeer,
      async(fullPeer) => {
        const inputGroupCall = (fullPeer as ChatFull.channelFull)?.call;
        if(!inputGroupCall) {
          return;
        }

        const fullCall = await rootScope.managers.appGroupCallsManager.getGroupCallFull(
          (inputGroupCall as InputGroupCall.inputGroupCall).id
        );
        return fullCall && (fullCall as GroupCall.groupCall).pFlags.rtmp_stream ?
          fullCall as GroupCall.groupCall :
          undefined;
      }
    );
    const shouldShow = createMemo(() => {
      return !!(isCallActive() && currentCall.peerId() !== peerId() && fullCall());
    });

    subscribeOn(rootScope)('group_call_update', async(call) => {
      if(!isCallActive() || call._ !== 'groupCall') return;
      const fullChat = fullPeer();
      if(fullChat?._ !== 'channelFull') return;

      if(call.id !== (fullChat.call as InputGroupCall.inputGroupCall)?.id) return;

      setWatching(call.participants_count);
    });

    createEffect<PeerId>((wasPeerId) => {
      if(!chat() || !(chat() as MTChat.channel).pFlags.broadcast) {
        return;
      }

      if(wasPeerId !== peerId()) {
        setWatching();
      }

      createEffect(() => {
        if(!isCallActive()) {
          setWatching();
        } else {
          setWatching(fullCall()?.participants_count);
        }
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
