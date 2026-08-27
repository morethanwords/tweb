import type ChatTopbar from '@components/chat/topbar';
import Chat from '@components/chat/chat';
import {ChatType} from '@components/chat/chatType';
import {LangPackKey, i18n} from '@lib/langPack';
import {PeerSettings} from '@layer';
import {AppManagers} from '@lib/managers';
import rootScope from '@lib/rootScope';
import callbackify from '@helpers/callbackify';
import confirmationPopup from '@components/confirmationPopup';
import classNames from '@helpers/string/classNames';
import ListenerSetter from '@helpers/listenerSetter';
import {AckedResult} from '@lib/superMessagePort';
import {Accessor, createSignal, For, Show} from 'solid-js';
import TopbarPlate, {createTopbarPlate, TopbarPlateController} from '@components/chat/topbarPlate';

type PeerSettingsKey = keyof PeerSettings['pFlags'];

/**
 * `reopen_topic` is not a peer setting — it mirrors tdesktop's `TopicReopenBar`
 * (`history_view_contact_status.cpp`), which lives in the very same bar stack as
 * the peer-settings actions and offers a single "Reopen topic" button while the
 * open topic is closed and the user may manage it.
 */
type ActionKey = PeerSettingsKey | 'reopen_topic';

type ActionDef = {
  key: ActionKey,
  onClick: () => void,
  danger?: boolean
};

type PeerSettingsActionDef = ActionDef & {key: PeerSettingsKey};

const LANG_KEY_MAP: {[key in ActionKey]?: LangPackKey} = {
  add_contact: 'AddContact',
  autoarchived: 'Unarchive',
  block_contact: 'BlockUser',
  report_spam: 'DeleteReportSpam',
  reopen_topic: 'RestartTopic'
};

export type ChatActionsPlate = TopbarPlateController & {
  set: (peerId: PeerId, settings: PeerSettings) => () => void,
  unset: (peerId: PeerId) => void,
  setPeerId: (peerId: PeerId) => Promise<AckedResult<() => void>>
};

function ActionsPlateBody(props: {
  buttons: Accessor<ActionDef[] | undefined>,
  canClose: Accessor<boolean>,
  onClose: () => void
}) {
  return (
    <>
      <Show when={props.buttons()}>
        {(btns) => (
          <For each={btns()}>
            {(action) => (
              <TopbarPlate.PrimaryButton
                danger={action.danger}
                onClick={action.onClick}
              >
                {(() => {
                  const text = i18n(LANG_KEY_MAP[action.key]);
                  text.classList.add(
                    'pinned-actions-primary-button-text',
                    'text-overflow-no-wrap',
                    'text-uppercase'
                  );
                  return text;
                })()}
              </TopbarPlate.PrimaryButton>
            )}
          </For>
        )}
      </Show>
      {/* Nothing to dismiss when the plate only carries the topic-reopen action —
          tdesktop's reopen bar has no close button either. */}
      <Show when={props.canClose()}>
        <TopbarPlate.CloseButton onClick={props.onClose} />
      </Show>
    </>
  );
}

export default function createChatActionsPlate(
  topbar: ChatTopbar,
  chat: Chat,
  managers: AppManagers,
  peerSettingsConsumer?: Pick<ChatActionsPlate, 'set' | 'unset'>
): ChatActionsPlate {
  const [buttons, setButtons] = createSignal<ActionDef[] | undefined>();
  const [canClose, setCanClose] = createSignal(false);
  const [disabled, setDisabled] = createSignal(false);

  let currentPeerId: PeerId | undefined;
  let currentThreadId: number | undefined;
  let peerSettingsActions: PeerSettingsActionDef[] = [];
  let canReopenTopic = false;

  const freeze = async(promise: Promise<any>) => {
    setDisabled(true);
    try {
      await promise;
    } catch(err) {

    }
    setDisabled(false);
  };

  const actions: PeerSettingsActionDef[] = [{
    key: 'autoarchived',
    onClick: async() => {
      const promise = managers.appMessagesManager.editPeerFolders([currentPeerId], 0);
      freeze(promise);
    }
  }, {
    key: 'block_contact',
    onClick: () => {
      topbar.blockUser(
        peerSettingsActions.some((action) => action.key === 'report_spam'),
        true,
        (promise) => freeze(promise)
      );
    },
    danger: true
  }, {
    key: 'add_contact',
    onClick: () => topbar.addContact()
  }, {
    key: 'report_spam',
    onClick: async() => {
      const peerId = currentPeerId;
      if(peerId.isUser()) {
        actions.find((action) => action.key === 'block_contact').onClick();
      } else {
        await confirmationPopup({
          titleLangKey: 'Chat.Confirm.ReportSpam.Header',
          descriptionLangKey: await managers.appPeersManager.isBroadcast(peerId) ?
            'Chat.Confirm.ReportSpam.Channel' :
            'Chat.Confirm.ReportSpam.Group',
          button: {langKey: 'ReportChat'}
        });

        const promise = Promise.all([
          managers.appMessagesManager.reportSpam(peerId),
          managers.appChatsManager.leave(peerId.toChatId())
        ]);
        freeze(promise);
      }
    },
    danger: true
  }];

  const reopenTopicAction: ActionDef = {
    key: 'reopen_topic',
    onClick: () => {
      freeze(managers.appMessagesManager.editForumTopic({
        peerId: currentPeerId,
        topicId: currentThreadId,
        closed: false
      }));
    }
  };

  const onClose = () => {
    if(currentPeerId !== undefined) {
      managers.appProfileManager.hidePeerSettingsBar(currentPeerId);
    }

    // Only the peer-settings half is dismissable — a still-closed topic keeps
    // offering the reopen button.
    peerSettingsActions = [];
    applyButtons();
  };

  const plate = createTopbarPlate({
    modifier: 'actions',
    height: 48,
    class: () => classNames(
      disabled() && 'is-disabled',
      buttons()?.length > 1 && 'is-multiple',
      buttons()?.length === 1 && !canClose() && 'is-single'
    ),
    onVisibilityChange: () => topbar.setFloating(),
    render: () => <ActionsPlateBody buttons={buttons} canClose={canClose} onClose={onClose} />
  });

  const applyButtons = () => {
    const list = canReopenTopic ? [reopenTopicAction, ...peerSettingsActions] : peerSettingsActions;
    const visible = list.slice(0, 2);
    setButtons(visible.length ? visible : undefined);
    setCanClose(!!peerSettingsActions.length);
    plate.setHidden(!visible.length);
  };

  /** A forum topic is the only thread kind that can be closed and reopened. */
  const supportsTopicReopen = (peerId: PeerId, threadId: number) => {
    return !!threadId && !!peerId?.isAnyChat() && chat.type === ChatType.Chat;
  };

  const ackedCanReopenTopic = (peerId: PeerId, threadId: number): Promise<AckedResult<boolean>> => {
    if(!supportsTopicReopen(peerId, threadId)) {
      return Promise.resolve({cached: true, result: Promise.resolve(false)});
    }

    return managers.acknowledged.dialogsStorage.canReopenTopic(peerId, threadId);
  };

  const refreshCanReopenTopic = async() => {
    const peerId = currentPeerId, threadId = currentThreadId;
    if(!supportsTopicReopen(peerId, threadId)) {
      return;
    }

    const value = await managers.dialogsStorage.canReopenTopic(peerId, threadId);
    if(currentPeerId !== peerId || currentThreadId !== threadId || canReopenTopic === value) {
      return;
    }

    canReopenTopic = value;
    applyButtons();
  };

  const listenerSetter = new ListenerSetter();

  // The topic's `closed` flag arrives as a `messageActionTopicEdit` service message.
  listenerSetter.add(rootScope)('dialogs_multiupdate', (dialogs) => {
    if(!currentThreadId || !dialogs.get(currentPeerId)?.topics?.has(currentThreadId)) {
      return;
    }

    refreshCanReopenTopic();
  });

  // ...and the rights that let us reopen it can change under us (tdesktop watches
  // `adminRightsValue` for the same reason).
  listenerSetter.add(rootScope)('chat_update', (chatId) => {
    if(!currentThreadId || currentPeerId !== chatId.toPeerId(true)) {
      return;
    }

    refreshCanReopenTopic();
  });

  const unsetOwn = (peerId: PeerId) => {
    currentPeerId = peerId;
    currentThreadId = undefined;
    peerSettingsActions = [];
    canReopenTopic = false;
    applyButtons();
  };

  const unset = (peerId: PeerId) => {
    unsetOwn(peerId);
    peerSettingsConsumer?.unset(peerId);
  };

  const set = (peerId: PeerId, settings: PeerSettings) => {
    const peerSettingsCallback = peerSettingsConsumer?.set(peerId, settings);
    const supportedActions = settings?.pFlags ?
      actions.filter((action) => settings.pFlags[action.key]) :
      [];

    return () => {
      currentPeerId = peerId;
      peerSettingsActions = supportedActions;
      if(supportedActions.length) {
        chat.bubbles.setPeerSettings(peerId, settings);
      }

      applyButtons();
      peerSettingsCallback?.();
    };
  };

  const setPeerId = (peerId: PeerId) => {
    const threadId = chat.threadId;
    return Promise.all([
      managers.acknowledged.appProfileManager.getPeerSettings(peerId),
      ackedCanReopenTopic(peerId, threadId)
    ]).then(([peerSettingsAcked, canReopenAcked]) => {
      return {
        cached: peerSettingsAcked.cached && canReopenAcked.cached,
        result: callbackify(
          Promise.all([peerSettingsAcked.result, canReopenAcked.result]),
          ([peerSettings, canReopen]) => {
            const setPeerSettings = set(peerId, peerSettings);
            return () => {
              currentThreadId = threadId;
              canReopenTopic = canReopen;
              setPeerSettings();
            };
          }
        )
      };
    });
  };

  return {
    ...plate,
    destroy: () => {
      listenerSetter.removeAll();
      plate.destroy();
    },
    set,
    unset,
    setPeerId
  };
}
