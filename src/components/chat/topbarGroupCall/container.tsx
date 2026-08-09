import {Accessor, Show, createEffect, createMemo, createResource, createSignal} from 'solid-js';
import type Chat from '@components/chat/chat';
import type ChatTopbar from '@components/chat/topbar';
import {ChatType} from '@components/chat/chatType';
import {ChatFull, InputGroupCall, Chat as MTChat} from '@layer';
import {NULL_PEER_ID} from '@appManagers/constants';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {AppManagers} from '@lib/managers';
import rootScope from '@lib/rootScope';
import appImManager from '@lib/appImManager';
import {i18n} from '@lib/langPack';
import {useChat} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {useCurrentGroupCall} from '@components/groupCall/hooks';
import TopbarPlate, {createTopbarPlate, TopbarPlateController} from '@components/chat/topbarPlate';
import {TopbarGroupCall} from '@components/chat/topbarGroupCall/topbarGroupCall';

export type ChatGroupCallPlate = TopbarPlateController & {
  setPeerId: (peerId: PeerId) => void
};

/** How many faces the avatar stack previews — the same three as every other client. */
const PREVIEW_AVATARS_COUNT = 3;

/**
 * Top-level component so solid-refresh can swap it on HMR — same split as the
 * live plate: everything the factory owns comes in through props.
 */
function GroupCallPlateBody(props: {
  peerId: Accessor<PeerId>,
  setHidden: (hidden: boolean) => void
}) {
  const peerChat = useChat(() => props.peerId().toChatId());
  const currentGroupCall = useCurrentGroupCall();

  // `call_active` + `call_not_empty` is what every client gates this bar on:
  // an empty (or already finished) call gets no plate. Both flags live on the
  // cheap peers store, so this settles before anything is fetched.
  const isCallActive = createMemo(() => {
    const chat = peerChat() as MTChat.chat | MTChat.channel;
    return !!(chat?.pFlags?.call_active && chat.pFlags.call_not_empty);
  });

  // Only chats that actually have a call subscribe to the full peer — that's
  // where the `inputGroupCall` lives, and nothing else here needs it.
  const fullPeer = createMemo(() => isCallActive() ? useFullPeer(props.peerId())() as ChatFull : undefined);

  const callId = createMemo(() => {
    const full = fullPeer();
    if(!full || !('call' in full)) return;
    return (full.call as InputGroupCall.inputGroupCall)?.id;
  });

  const [preview, {refetch}] = createResource(
    callId,
    (id) => rootScope.managers.appGroupCallsManager.getGroupCallPreview(id, PREVIEW_AVATARS_COUNT)
  );

  const groupCall = createMemo(() => {
    const call = preview()?.call;
    // RTMP streams belong to the live plate; everything else is a video chat.
    return call?._ === 'groupCall' && !call.pFlags.rtmp_stream ? call : undefined;
  });

  const shouldShow = createMemo(() => !!(
    isCallActive() &&
    groupCall() &&
    currentGroupCall()?.chatId !== props.peerId().toChatId()
  ));

  // Joins and leaves bump `participants_count`, which is exactly when both the
  // counter and the avatar stack go stale. The refetch is worker-cache-cheap:
  // the call is already saved, so only the roster read crosses the boundary.
  subscribeOn(rootScope)('group_call_update', (call) => {
    // Ids come back as numbers when they fit a safe integer, but are kept as
    // strings elsewhere — compare stringified or every update slips through.
    if(callId() !== undefined && String(call.id) === String(callId())) {
      refetch();
    }
  });

  createEffect(() => props.setHidden(!shouldShow()));

  return (
    <Show when={shouldShow() && groupCall()}>
      {(call) => (
        <TopbarGroupCall
          title={call().title}
          participantsCount={call().participants_count}
          participantPeerIds={preview()?.peerIds || []}
          actionButton={
            <TopbarPlate.ActionButton
              onClick={() => appImManager.joinGroupCall(props.peerId())}
            >
              {i18n('VoiceChat.Topbar.Join')}
            </TopbarPlate.ActionButton>
          }
        />
      )}
    </Show>
  );
}

export default function createChatGroupCallPlate(
  topbar: ChatTopbar,
  chat: Chat,
  managers: AppManagers
): ChatGroupCallPlate {
  const [peerId, setPeerIdSignal] = createSignal<PeerId>(NULL_PEER_ID);

  const plate = createTopbarPlate({
    modifier: 'group-call',
    height: 48,
    onVisibilityChange: () => topbar.setFloating(),
    render: ({setHidden}) => <GroupCallPlateBody peerId={peerId} setHidden={setHidden} />
  });

  return {
    ...plate,
    // Same gate as the topbar's video-chat button: real chats only, no
    // threads, no private peers. Anything else parks the plate on NULL_PEER_ID.
    setPeerId: (next) => setPeerIdSignal(
      chat.type === ChatType.Chat && !chat.threadId && !next.isUser() ? next : NULL_PEER_ID
    )
  };
}
