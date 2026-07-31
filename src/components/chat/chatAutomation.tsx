import {AvatarNewTsx} from '@components/avatarNew';
import {ButtonMenuToggleTsx} from '@components/buttonMenuToggleTsx';
import Chat from '@components/chat/chat';
import ChatTopbar from '@components/chat/topbar';
import TopbarPlate, {createTopbarPlate, TopbarPlateController} from '@components/chat/topbarPlate';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import {PeerSettings} from '@layer';
import isSameUserId from '@helpers/isSameUserId';
import {AppManagers} from '@lib/managers';
import {i18n, LangPackKey} from '@lib/langPack';
import {Accessor, createMemo, createSignal, Show} from 'solid-js';

type AutomationState = {
  peerId: PeerId,
  botId: UserId,
  paused: boolean,
  canReply: boolean,
  manageUrl?: string
};

export type ChatAutomationPlate = TopbarPlateController & {
  set: (peerId: PeerId, settings: PeerSettings) => () => void,
  unset: (peerId: PeerId) => void,
  handleConnectedBotUpdate: (botId?: UserId) => void
};

function AutomationPlateBody(props: {
  state: Accessor<AutomationState | undefined>,
  onToggle: () => void,
  onManage: () => void,
  onRemove: () => void
}) {
  const statusKey = createMemo<LangPackKey>(() => {
    const state = props.state();
    if(state?.paused) return 'ChatAutomation.BotPaused';
    if(state?.canReply) return 'ChatAutomation.BotManagesChat';
    return 'ChatAutomation.BotHasAccess';
  });

  const canToggle = createMemo(() => {
    const state = props.state();
    return !!(state?.paused || state?.canReply);
  });

  return (
    <TopbarPlate.Body noRipple class="person">
      <Show when={props.state()}>
        {(state) => (
          <>
            <AvatarNewTsx
              class="person-avatar"
              peerId={state().botId.toPeerId(false)}
              size={40}
              isDialog
            />
            <div class="content">
              <div class="top">
                <div class="user-title">
                  <PeerTitleTsx peerId={state().botId.toPeerId(false)} />
                </div>
              </div>
              <div class="bottom">
                <div class="info">{i18n(statusKey())}</div>
              </div>
            </div>
            <Show when={canToggle()}>
              <TopbarPlate.ActionButton onClick={props.onToggle}>
                {i18n(state().paused ? 'ChatAutomation.Start' : 'ChatAutomation.Stop')}
              </TopbarPlate.ActionButton>
            </Show>
            <ButtonMenuToggleTsx
              class="pinned-automation-menu"
              direction="bottom-right"
              buttons={[{
                icon: 'settings',
                text: 'ChatAutomation.ManageBot',
                onClick: props.onManage,
                verify: () => !!props.state()?.manageUrl
              }, {
                icon: 'delete',
                text: 'ChatAutomation.RemoveFromChat',
                danger: true,
                onClick: props.onRemove,
                verify: () => !!(props.state()?.paused || props.state()?.canReply)
              }, {
                icon: 'delete',
                text: 'ChatAutomation.RevokeFromChat',
                danger: true,
                onClick: props.onRemove,
                verify: () => !!props.state() && !props.state()?.paused && !props.state()?.canReply
              }]}
            />
          </>
        )}
      </Show>
    </TopbarPlate.Body>
  );
}

export default function createChatAutomationPlate(
  topbar: ChatTopbar,
  chat: Chat,
  managers: AppManagers
): ChatAutomationPlate {
  const [state, setState] = createSignal<AutomationState>();
  const [busy, setBusy] = createSignal(false);
  let stateGeneration = 0;

  const plate = createTopbarPlate({
    modifier: 'automation',
    height: 52,
    onVisibilityChange: () => topbar.setFloating(),
    render: () => (
      <AutomationPlateBody
        state={state}
        onToggle={async() => {
          const previous = state();
          if(!previous || busy()) return;

          const generation = stateGeneration;
          const paused = !previous.paused;
          setBusy(true);
          setState({...previous, paused, canReply: !paused});
          try {
            await managers.appBusinessManager.toggleConnectedBotPaused(
              previous.peerId,
              paused,
              previous.botId
            );
          } catch(err) {
            if(stateGeneration === generation) setState(previous);
          } finally {
            if(stateGeneration === generation) setBusy(false);
          }
        }}
        onManage={() => {
          const url = state()?.manageUrl;
          if(url) chat.appImManager.openUrl(url, true);
        }}
        onRemove={async() => {
          const previous = state();
          if(!previous || busy()) return;

          const generation = stateGeneration;
          setBusy(true);
          setState(undefined);
          plate.setHidden(true);
          try {
            await managers.appBusinessManager.disablePeerConnectedBot(previous.peerId, previous.botId);
          } catch(err) {
            if(stateGeneration === generation) {
              setState(previous);
              plate.setHidden(false);
            }
          } finally {
            if(stateGeneration === generation) setBusy(false);
          }
        }}
      />
    )
  });

  const unset = (peerId: PeerId) => {
    ++stateGeneration;
    setBusy(false);
    setState(undefined);
    plate.setHidden(true);
  };

  const set = (peerId: PeerId, settings: PeerSettings) => {
    const botId = settings?.business_bot_id as UserId;
    if(!peerId.isUser() || !botId) {
      return () => unset(peerId);
    }

    return () => {
      ++stateGeneration;
      setBusy(false);
      setState({
        peerId,
        botId,
        paused: !!settings.pFlags?.business_bot_paused,
        canReply: !!settings.pFlags?.business_bot_can_reply,
        manageUrl: settings.business_bot_manage_url
      });
      plate.setHidden(false);
    };
  };

  const handleConnectedBotUpdate = (botId?: UserId) => {
    const current = state();
    if(!current) {
      if(!busy() && botId && chat.peerId?.isUser()) {
        managers.appProfileManager.refreshPeerSettings(chat.peerId).catch(() => {});
      }
      return;
    }

    if(!botId || !isSameUserId(current.botId, botId)) {
      unset(current.peerId);
    }
    managers.appProfileManager.refreshPeerSettingsIfNeeded(current.peerId).catch(() => {});
  };

  return {...plate, set, unset, handleConnectedBotUpdate};
}
