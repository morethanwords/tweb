import type ChatTopbar from '@components/chat/topbar';
import Chat from '@components/chat/chat';
import {ChatType} from '@components/chat/chatType';
import {LangPackKey, i18n} from '@lib/langPack';
import {PeerSettings} from '@layer';
import {AppManagers} from '@lib/managers';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';
import callbackify from '@helpers/callbackify';
import confirmationPopup from '@components/confirmationPopup';
import classNames from '@helpers/string/classNames';
import ListenerSetter from '@helpers/listenerSetter';
import Icon from '@components/icon';
import PeerTitle from '@components/peerTitle';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import PopupElement from '@components/popups';
import PopupPeer from '@components/popups/peer';
import {toastNew} from '@components/toast';
import formatUserPhone from '@components/wrappers/formatUserPhone';
import {formatFullSentTime} from '@helpers/date';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {AckedResult} from '@lib/superMessagePort';
import {Accessor, createSignal, For, Show} from 'solid-js';
import TopbarPlate, {createTopbarPlate, TopbarPlateController} from '@components/chat/topbarPlate';

type PeerSettingsKey = keyof PeerSettings['pFlags'];

/**
 * `reopen_topic` and `set_bot_photo` are not peer settings — they mirror the two
 * sibling bars tdesktop stacks next to the contact status one (`TopicReopenBar`
 * and `ContactStatus::State::Type::SetBotPhoto`, `history_view_contact_status.cpp`).
 */
type ActionKey = PeerSettingsKey | 'reopen_topic' | 'set_bot_photo';

type ActionDef = {
  key: ActionKey,
  onClick: () => void,
  danger?: boolean,
  icon?: Icon,
  /** Reads as a prompt rather than a command, so it keeps its own casing. */
  keepCase?: boolean
};

type PeerSettingsActionDef = ActionDef & {key: PeerSettingsKey};

/**
 * The `request_chat_*` peer settings, which describe the join request that made this
 * stranger able to write to us. Rendered as a tappable info line instead of buttons.
 */
type RequestChatInfo = {
  peerId: PeerId,
  title: string,
  date: number,
  isBroadcast: boolean
};

const LANG_KEY_MAP: {[key in ActionKey]?: LangPackKey} = {
  add_contact: 'AddContact',
  autoarchived: 'Unarchive',
  block_contact: 'BlockUser',
  report_spam: 'DeleteReportSpam',
  share_contact: 'ShareMyPhoneNoCaps',
  reopen_topic: 'RestartTopic',
  set_bot_photo: 'SetProfilePhoto'
};

/**
 * Session state for the set-photo prompt, keyed by bot. tdesktop keeps the same two
 * fields on `BotInfo`, i.e. for as long as the session lives:
 * - `openedEmpty` — whether that bot's chat was empty the first time we opened it;
 *   only then is the prompt ever offered (`FinalizeSetBotPhotoFirstOpenState`).
 * - `hidden` — the prompt's cross, which dismisses it locally without touching the
 *   server-side settings bar.
 */
const botPhotoPromptOpenedEmpty = new Map<PeerId, boolean>();
const botPhotoPromptHidden = new Set<PeerId>();

export type ChatActionsPlate = TopbarPlateController & {
  set: (peerId: PeerId, settings: PeerSettings) => () => void,
  unset: (peerId: PeerId) => void,
  setPeerId: (peerId: PeerId) => Promise<AckedResult<() => void>>
};

function ActionsPlateBody(props: {
  buttons: Accessor<ActionDef[] | undefined>,
  requestChat: Accessor<RequestChatInfo | undefined>,
  canClose: Accessor<boolean>,
  onClose: () => void,
  onRequestChatClick: (info: RequestChatInfo) => void
}) {
  return (
    <Show
      // keyed: the line is built imperatively, so a switch straight from one
      // request-chat peer to another has to rebuild it rather than keep the old title
      keyed
      when={props.requestChat()}
      fallback={
        <>
          <Show when={props.buttons()}>
            {(btns) => (
              <For each={btns()}>
                {(action) => (
                  <TopbarPlate.PrimaryButton
                    danger={action.danger}
                    onClick={action.onClick}
                  >
                    {action.icon && Icon(action.icon, 'pinned-actions-primary-button-icon')}
                    {(() => {
                      const text = i18n(LANG_KEY_MAP[action.key]);
                      text.classList.add(
                        'pinned-actions-primary-button-text',
                        'text-overflow-no-wrap',
                        ...(action.keepCase ? [] : ['text-uppercase'])
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
      }
    >
      {(info) => {
        const peerTitle = new PeerTitle();
        peerTitle.update({peerId: info.peerId});

        return (
          <TopbarPlate.PrimaryButton
            quiet
            class="pinned-actions-info rp-overflow"
            onClick={() => props.onRequestChatClick(info)}
          >
            {i18n(
              info.isBroadcast ? 'ChatWithChannelAdmin' : 'ChatWithGroupAdmin',
              [peerTitle.element, wrapEmojiText(info.title)]
            )}
          </TopbarPlate.PrimaryButton>
        );
      }}
    </Show>
  );
}

export default function createChatActionsPlate(
  topbar: ChatTopbar,
  chat: Chat,
  managers: AppManagers,
  peerSettingsConsumer?: Pick<ChatActionsPlate, 'set' | 'unset'>
): ChatActionsPlate {
  const [buttons, setButtons] = createSignal<ActionDef[] | undefined>();
  const [requestChat, setRequestChat] = createSignal<RequestChatInfo | undefined>();
  const [canClose, setCanClose] = createSignal(false);
  const [disabled, setDisabled] = createSignal(false);

  let currentPeerId: PeerId | undefined;
  let currentThreadId: number | undefined;
  let currentSettings: PeerSettings | undefined;
  let peerSettingsActions: PeerSettingsActionDef[] = [];
  let requestChatInfo: RequestChatInfo | undefined;
  let canReopenTopic = false;
  let canSetBotPhoto = false;

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
    key: 'share_contact',
    onClick: async() => {
      const peerId = currentPeerId;
      const userId = peerId.toUserId();
      const myPhone = apiManagerProxy.getUser(rootScope.myId.toUserId())?.phone;
      await confirmationPopup({
        titleLangKey: 'ShareYouPhoneNumberTitle',
        descriptionLangKey: 'AreYouSureShareMyContactInfoUser',
        descriptionLangArgs: [
          myPhone ? formatUserPhone(myPhone) : '',
          await wrapPeerTitle({peerId})
        ],
        button: {langKey: 'OK'}
      });

      const promise = managers.appUsersManager.acceptContact(userId).then(() => {
        toastNew({
          langPackKey: 'Conversation.ShareMyPhoneNumber.StatusSuccess',
          langPackArguments: [new PeerTitle({peerId, onlyFirstName: true}).element]
        });
      });
      freeze(promise);
    }
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

  const setBotPhotoAction: ActionDef = {
    key: 'set_bot_photo',
    icon: 'cameraadd',
    keepCase: true,
    onClick: () => topbar.editBot()
  };

  const showRequestChatInfoPopup = (info: RequestChatInfo) => {
    PopupElement.createPopup(PopupPeer, 'popup-confirmation', {
      titleLangKey: info.isBroadcast ? 'ChatWithAdminChannelTitle' : 'ChatWithAdminGroupTitle',
      descriptionLangKey: 'ChatWithAdminMessage',
      descriptionLangArgs: [wrapEmojiText(info.title), formatFullSentTime(info.date, true, true)],
      buttons: [{
        // `isCancel` keeps `addCancelButton` from adding a second button — tdesktop's
        // box acknowledges and dismisses with this one.
        langKey: 'IUnderstand',
        isCancel: true,
        callback: () => {
          managers.appProfileManager.hidePeerSettingsBar(info.peerId);
        }
      }]
    }).show();
  };

  const onClose = () => {
    // The set-photo prompt is ours alone: tdesktop's cross only sets `setBotPhotoHidden`,
    // it never hides the server-side settings bar.
    if(canSetBotPhoto && !peerSettingsActions.length) {
      botPhotoPromptHidden.add(currentPeerId);
      canSetBotPhoto = false;
      applyState();
      return;
    }

    if(currentPeerId !== undefined) {
      managers.appProfileManager.hidePeerSettingsBar(currentPeerId);
    }

    // Only the peer-settings half is dismissable — a still-closed topic keeps
    // offering the reopen button.
    peerSettingsActions = [];
    applyState();
  };

  const plate = createTopbarPlate({
    modifier: 'actions',
    // 'auto' because the request-chat line wraps; the button rows keep their fixed
    // height through `min-height` in the stylesheet.
    height: 'auto',
    class: () => classNames(
      disabled() && 'is-disabled',
      buttons()?.length > 1 && 'is-multiple',
      buttons()?.length === 1 && !canClose() && 'is-single'
    ),
    onVisibilityChange: () => topbar.setFloating(),
    render: () => (
      <ActionsPlateBody
        buttons={buttons}
        requestChat={requestChat}
        canClose={canClose}
        onClose={onClose}
        onRequestChatClick={showRequestChatInfoPopup}
      />
    )
  });

  const applyState = () => {
    setRequestChat(requestChatInfo);
    if(requestChatInfo) {
      setButtons(undefined);
      setCanClose(false);
      plate.setHidden(false);
    } else {
      let list = canReopenTopic ? [reopenTopicAction, ...peerSettingsActions] : peerSettingsActions;
      // tdesktop offers the set-photo prompt only when no peer setting claims the bar.
      if(!list.length && canSetBotPhoto) {
        list = [setBotPhotoAction];
      }

      const visible = list.slice(0, 2);
      setButtons(visible.length ? visible : undefined);
      setCanClose(!!peerSettingsActions.length || canSetBotPhoto);
      plate.setHidden(!visible.length);
    }

    // The plate measures itself ('auto'), and its content height changes with the mode.
    topbar.setFloating();
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
    applyState();
  };

  /**
   * Everything but "was the chat empty when first opened" is on the cached user, so a
   * chat that can't possibly want the prompt costs no round-trip at all.
   */
  const isBotPhotoPromptPossible = (peerId: PeerId) => {
    if(!peerId?.isUser() || botPhotoPromptHidden.has(peerId)) {
      return false;
    }

    const user = apiManagerProxy.getUser(peerId.toUserId());
    return !!user?.pFlags?.bot && !!user.pFlags.bot_can_edit && !user.photo;
  };

  const ackedCanSetBotPhoto = async(peerId: PeerId): Promise<AckedResult<boolean>> => {
    if(!isBotPhotoPromptPossible(peerId)) {
      return {cached: true, result: Promise.resolve(false)};
    }

    const remembered = botPhotoPromptOpenedEmpty.get(peerId);
    if(remembered !== undefined) {
      return {cached: true, result: Promise.resolve(remembered)};
    }

    const acked = await managers.acknowledged.appMessagesManager.getDialogOnly(peerId);
    return {
      cached: acked.cached,
      result: acked.result.then((dialog) => {
        const openedEmpty = !dialog?.top_message;
        botPhotoPromptOpenedEmpty.set(peerId, openedEmpty);
        return openedEmpty;
      })
    };
  };

  const refreshCanSetBotPhoto = () => {
    const value = isBotPhotoPromptPossible(currentPeerId) &&
      !!botPhotoPromptOpenedEmpty.get(currentPeerId);
    if(canSetBotPhoto === value) {
      return;
    }

    canSetBotPhoto = value;
    applyState();
  };

  /**
   * tdesktop's `ContactStatus::PeerState` is a priority chain, not a flat filter: a
   * contact only ever gets the share-phone bar, and the join-request line takes the
   * whole bar from everything below it.
   */
  const recomputePeerSettings = () => {
    const settings = currentSettings;
    const pFlags = settings?.pFlags;
    peerSettingsActions = [];
    requestChatInfo = undefined;
    if(!pFlags) {
      return;
    }

    const isUser = currentPeerId.isUser();
    if(isUser && apiManagerProxy.getUser(currentPeerId.toUserId())?.pFlags?.contact) {
      if(pFlags.share_contact) {
        peerSettingsActions = actions.filter((action) => action.key === 'share_contact');
      }

      return;
    }

    if(isUser && settings.request_chat_title !== undefined) {
      requestChatInfo = {
        peerId: currentPeerId,
        title: settings.request_chat_title,
        date: settings.request_chat_date,
        isBroadcast: !!pFlags.request_chat_broadcast
      };
      return;
    }

    peerSettingsActions = actions.filter((action) => {
      return action.key !== 'share_contact' && pFlags[action.key];
    });
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

  // Becoming a contact swaps the whole branch of the chain (tdesktop watches the
  // `Contact` user flag).
  listenerSetter.add(rootScope)('contacts_update', (userId) => {
    if(currentPeerId !== userId.toPeerId(false)) {
      return;
    }

    recomputePeerSettings();
    applyState();
  });

  // Once the bot has a photo the prompt is done — tdesktop drops it on `Photo` updates.
  listenerSetter.add(rootScope)('avatar_update', ({peerId}) => {
    if(currentPeerId !== peerId) {
      return;
    }

    refreshCanSetBotPhoto();
  });

  const unsetOwn = (peerId: PeerId) => {
    currentPeerId = peerId;
    currentThreadId = undefined;
    currentSettings = undefined;
    peerSettingsActions = [];
    requestChatInfo = undefined;
    canReopenTopic = false;
    canSetBotPhoto = false;
    applyState();
  };

  const unset = (peerId: PeerId) => {
    unsetOwn(peerId);
    peerSettingsConsumer?.unset(peerId);
  };

  const set = (peerId: PeerId, settings: PeerSettings) => {
    const peerSettingsCallback = peerSettingsConsumer?.set(peerId, settings);

    return () => {
      currentPeerId = peerId;
      currentSettings = settings;
      recomputePeerSettings();
      if(peerSettingsActions.length || requestChatInfo) {
        chat.bubbles.setPeerSettings(peerId, settings);
      }

      applyState();
      peerSettingsCallback?.();
    };
  };

  const setPeerId = (peerId: PeerId) => {
    const threadId = chat.threadId;
    return Promise.all([
      managers.acknowledged.appProfileManager.getPeerSettings(peerId),
      ackedCanReopenTopic(peerId, threadId),
      ackedCanSetBotPhoto(peerId)
    ]).then(([peerSettingsAcked, canReopenAcked, canSetBotPhotoAcked]) => {
      return {
        cached: peerSettingsAcked.cached && canReopenAcked.cached && canSetBotPhotoAcked.cached,
        result: callbackify(
          Promise.all([peerSettingsAcked.result, canReopenAcked.result, canSetBotPhotoAcked.result]),
          ([peerSettings, canReopen, canSetPhoto]) => {
            const setPeerSettings = set(peerId, peerSettings);
            return () => {
              currentThreadId = threadId;
              canReopenTopic = canReopen;
              canSetBotPhoto = canSetPhoto;
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
