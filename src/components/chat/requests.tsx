import type ChatTopbar from '@components/chat/topbar';
import Chat from '@components/chat/chat';
import I18n from '@lib/langPack';
import {ChatFull} from '@layer';
import {AppManagers} from '@lib/managers';
import StackedAvatars from '@components/stackedAvatars';
import appSidebarRight from '@components/sidebarRight';
import {AppChatRequestsTab} from '@components/solidJsTabs/tabs';
import callbackify from '@helpers/callbackify';
import {ONE_DAY} from '@helpers/date';
import {MiddlewareHelper, getMiddleware} from '@helpers/middleware';
import {AckedResult} from '@lib/superMessagePort';
import {Accessor, createEffect, createSignal, Show} from 'solid-js';
import TopbarPlate, {createTopbarPlate, TopbarPlateController} from '@components/chat/topbarPlate';

/** Matches the plate's buttons — the stack mirrors the close button's slot. */
const AVATAR_SIZE = 40;

type RequestData = {
  peerId: PeerId,
  avatars: StackedAvatars,
  avatarsMiddleware: MiddlewareHelper,
  length: number
};

export type ChatRequestsPlate = TopbarPlateController & {
  set: (peerId: PeerId, peerIds: PeerId[], length: number) => Promise<() => void>,
  unset: (peerId: PeerId) => void,
  setPeerId: (peerId: PeerId) => Promise<AckedResult<() => void>>
};

function RequestsPlateBody(props: {
  data: Accessor<RequestData | undefined>,
  onOpen: () => void,
  onClose: () => void
}) {
  const titleElement = new I18n.IntlElement({
    key: 'Chat.Header.RequestToJoin',
    args: [0]
  });
  // The plate is a fixed 48px — a large pending count has to ellipsize
  // instead of wrapping the label onto a second line.
  titleElement.element.classList.add('text-overflow-no-wrap');

  // The label lives outside the `Show`, so it is updated from an effect — every
  // `set()` writes a fresh `RequestData`, including while the plate is already
  // on screen (`chat_requests` fires on every pending-count change).
  createEffect(() => {
    const d = props.data();
    if(d) titleElement.compareAndUpdate({args: [d.length]});
  });

  // Same shape as the translation plate — a centred pill with the close button
  // floating over the plate's end — with the requesters' faces leading it, the
  // way every other client puts them in front of the label.
  return (
    <>
      {/* `keyed` so a new `RequestData` swaps the stack: a plain `Show` only
          re-runs its child when `when` flips truthiness, which would leave the
          previous requesters' faces on a visible plate. */}
      <Show when={props.data()} keyed>
        {(d) => d.avatars.container}
      </Show>
      <TopbarPlate.PrimaryButton onClick={props.onOpen}>
        {titleElement.element}
      </TopbarPlate.PrimaryButton>
      <TopbarPlate.CloseButton onClick={props.onClose} />
    </>
  );
}

export default function createChatRequestsPlate(
  topbar: ChatTopbar,
  chat: Chat,
  managers: AppManagers
): ChatRequestsPlate {
  const [data, setData] = createSignal<RequestData | undefined>();

  let currentPeerId: PeerId | undefined;

  const onOpen = async() => {
    if(appSidebarRight.isTabExists(AppChatRequestsTab)) return;
    const tab = appSidebarRight.createTab(AppChatRequestsTab);
    await tab.open(chat.peerId.toChatId());
    appSidebarRight.toggleSidebar(true);
  };

  const onClose = () => {
    if(currentPeerId !== undefined) {
      chat.setAppState('hideChatJoinRequests', currentPeerId, Date.now());
    }
    unset(currentPeerId);
  };

  const plate = createTopbarPlate({
    modifier: 'requests',
    height: 48,
    onVisibilityChange: () => topbar.setFloating(),
    render: () => <RequestsPlateBody data={data} onOpen={onOpen} onClose={onClose} />
  });

  const unset = (peerId: PeerId) => {
    currentPeerId = peerId;
    const prev = data();
    if(prev) prev.avatarsMiddleware.destroy();
    setData(undefined);
    plate.setHidden(true);
  };

  const set = async(peerId: PeerId, peerIds: PeerId[], length: number) => {
    if(!peerIds.length) {
      return () => unset(peerId);
    }

    const avatarsMiddleware = getMiddleware();
    const avatars = new StackedAvatars({avatarSize: AVATAR_SIZE, middleware: avatarsMiddleware.get()});
    const loadPromises: Promise<any>[] = [];
    avatars.render(peerIds, loadPromises);
    await Promise.all(loadPromises);

    return () => {
      const prev = data();
      currentPeerId = peerId;
      setData({peerId, avatars, avatarsMiddleware, length});
      plate.setHidden(false);
      if(prev) prev.avatarsMiddleware.destroy();
    };
  };

  const setPeerId = (peerId: PeerId) => {
    return Promise.all([
      managers.acknowledged.appProfileManager.getProfileByPeerId(peerId)
    ]).then(([peerFullAcked]) => {
      return {
        cached: peerFullAcked.cached,
        result: callbackify(peerFullAcked.result, (peerFull) => {
          const recentRequesters = (peerFull as ChatFull.channelFull)?.recent_requesters;
          const hidden = chat.appState.hideChatJoinRequests[peerId];
          if(recentRequesters && (!hidden || (Date.now() - hidden) >= ONE_DAY)) {
            return set(
              peerId,
              recentRequesters.slice(0, 3).map((userId) => userId.toPeerId(false)),
              (peerFull as ChatFull.channelFull).requests_pending
            );
          } else {
            return set(peerId, [], 0);
          }
        })
      };
    });
  };

  return {
    ...plate,
    set,
    unset,
    setPeerId,
    destroy: () => {
      const prev = data();
      if(prev) prev.avatarsMiddleware.destroy();
      plate.destroy();
    }
  };
}
