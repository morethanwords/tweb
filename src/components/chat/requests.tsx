import type ChatTopbar from '@components/chat/topbar';
import Chat from '@components/chat/chat';
import I18n from '@lib/langPack';
import {ChatFull} from '@layer';
import {AppManagers} from '@lib/managers';
import StackedAvatars from '@components/stackedAvatars';
import appSidebarRight from '@components/sidebarRight';
import AppChatRequestsTab from '@components/sidebarRight/tabs/chatRequests';
import callbackify from '@helpers/callbackify';
import {ONE_DAY} from '@helpers/date';
import {MiddlewareHelper, getMiddleware} from '@helpers/middleware';
import {AckedResult} from '@lib/superMessagePort';
import {Accessor, createSignal, Show} from 'solid-js';
import TopbarPlate, {createTopbarPlate, TopbarPlateController} from '@components/chat/topbarPlate';

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

  return (
    <TopbarPlate.Body onClick={props.onOpen}>
      <Show when={props.data()}>
        {(d) => {
          titleElement.compareAndUpdate({args: [d().length]});
          return (
            <>
              {d().avatars.container}
              {titleElement.element}
            </>
          );
        }}
      </Show>
      <div class="pinned-container-wrapper-utils pinned-requests-wrapper-utils">
        <TopbarPlate.CloseButton onClick={props.onClose} />
      </div>
    </TopbarPlate.Body>
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
    height: 52,
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
    const avatars = new StackedAvatars({avatarSize: 32, middleware: avatarsMiddleware.get()});
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
