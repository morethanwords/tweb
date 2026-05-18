import {Accessor, Show, createEffect, createMemo, createResource, createSignal} from 'solid-js';
import {TopbarLive} from '@components/chat/topbarLive/topbarLive';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import rootScope from '@lib/rootScope';
import {useCurrentRtmpCall} from '@components/rtmp/hooks';
import {AppManagers} from '@lib/managers';
import Chat from '@components/chat/chat';
import ChatTopbar from '@components/chat/topbar';
import {NULL_PEER_ID} from '@appManagers/constants';
import {ChatFull, GroupCall, InputGroupCall, Chat as MTChat} from '@layer';
import appImManager from '@lib/appImManager';
import {useChat} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {i18n} from '@lib/langPack';
import TopbarPlate, {createTopbarPlate, TopbarPlateController} from '@components/chat/topbarPlate';

export type ChatLivePlate = TopbarPlateController & {
  setPeerId: (peerId: PeerId) => void
};

/**
 * Top-level component so solid-refresh can swap it on HMR. Reads its
 * inputs (peerId signal, setHidden) through props so factory-owned state
 * — captured in `createChatLivePlate`'s closure — survives module reloads.
 */
function LivePlateBody(props: {
  peerId: Accessor<PeerId>,
  setHidden: (hidden: boolean) => void
}) {
  const [watching, setWatching] = createSignal<number>();
  const peerChat = useChat(() => props.peerId().toChatId());
  const [fullPeer, setFullPeer] = createSignal<ChatFull | undefined>();
  createEffect(() => {
    const fullPeer = useFullPeer(props.peerId());
    createEffect(() => setFullPeer(fullPeer() as ChatFull));
  });
  const currentCall = useCurrentRtmpCall();
  const isCallActive = createMemo(() => {
    const c = peerChat();
    return !!(
      c &&
      (c as MTChat.channel).pFlags.broadcast &&
      (c as MTChat.channel).pFlags.call_active &&
      (c as MTChat.channel).pFlags.call_not_empty
    );
  });
  const [fullCall] = createResource(
    fullPeer,
    async(fullPeer) => {
      const inputGroupCall = (fullPeer as ChatFull.channelFull)?.call;
      if(!inputGroupCall) return;

      const fullCall = await rootScope.managers.appGroupCallsManager.getGroupCallFull(
        (inputGroupCall as InputGroupCall.inputGroupCall).id
      );
      return fullCall && (fullCall as GroupCall.groupCall).pFlags.rtmp_stream ?
        fullCall as GroupCall.groupCall :
        undefined;
    }
  );
  const shouldShow = createMemo(() => {
    return !!(isCallActive() && currentCall.peerId() !== props.peerId() && fullCall());
  });

  subscribeOn(rootScope)('group_call_update', async(call) => {
    if(!isCallActive() || call._ !== 'groupCall') return;
    const fullChat = fullPeer();
    if(fullChat?._ !== 'channelFull') return;
    if(call.id !== (fullChat.call as InputGroupCall.inputGroupCall)?.id) return;
    setWatching(call.participants_count);
  });

  createEffect<PeerId>((wasPeerId) => {
    if(!peerChat() || !(peerChat() as MTChat.channel).pFlags.broadcast) return;

    if(wasPeerId !== props.peerId()) setWatching();

    createEffect(() => {
      if(!isCallActive()) setWatching();
      else setWatching(fullCall()?.participants_count);
    });

    return props.peerId();
  });

  createEffect(() => props.setHidden(!shouldShow()));

  return (
    <Show when={shouldShow()}>
      <TopbarLive
        watching={watching()}
        actionButton={
          <TopbarPlate.ActionButton
            onClick={() => appImManager.joinLiveStream(props.peerId())}
          >
            {i18n('Rtmp.Topbar.Join')}
          </TopbarPlate.ActionButton>
        }
      />
    </Show>
  );
}

export default function createChatLivePlate(
  topbar: ChatTopbar,
  chat: Chat,
  managers: AppManagers
): ChatLivePlate {
  const [peerId, setPeerIdSignal] = createSignal<PeerId>(NULL_PEER_ID);

  const plate = createTopbarPlate({
    modifier: 'live',
    height: 48,
    onVisibilityChange: () => topbar.setFloating(),
    render: ({setHidden}) => <LivePlateBody peerId={peerId} setHidden={setHidden} />
  });

  return {
    ...plate,
    setPeerId: (next) => setPeerIdSignal(next)
  };
}
