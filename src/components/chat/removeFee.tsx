import callbackify from '@helpers/callbackify';
import namedPromises from '@helpers/namedPromises';
import {numberThousandSplitterForStars} from '@helpers/number/numberThousandSplitter';
import {AppManagers} from '@lib/managers';
import {i18n} from '@lib/langPack';
import confirmationPopup from '@components/confirmationPopup';
import Icon from '@components/icon';
import PeerTitle from '@components/peerTitle';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import Chat from '@components/chat/chat';
import type ChatTopbar from '@components/chat/topbar';
import {AckedResult} from '@lib/superMessagePort';
import {Accessor, createSignal, Show} from 'solid-js';
import TopbarPlate, {createTopbarPlate, TopbarPlateController} from '@components/chat/topbarPlate';

type SetArgs = {
  peerId: PeerId,
  monoforumThreadId?: PeerId,
  starsCharged: number
};

const className = 'remove-fee';

export type ChatRemoveFeePlate = TopbarPlateController & {
  setPeerId: (peerId: PeerId) => Promise<AckedResult<() => void>>,
  hide: () => void
};

function RemoveFeePlateBody(props: {
  args: Accessor<SetArgs | undefined>,
  chat: Chat,
  hide: () => void
}) {
  return (
    <Show when={props.args()}>
      {(a) => {
        const peerTitle = new PeerTitle();
        peerTitle.update({
          peerId: a().monoforumThreadId || a().peerId,
          onlyFirstName: true,
          limitSymbols: 20
        });

        const inlineStars = (
          <span>
            {Icon('star', 'inline-icon', 'inline-icon-left')}
            {numberThousandSplitterForStars(+a().starsCharged)}
          </span>
        ) as unknown as HTMLElement;

        const text = i18n('PaidMessages.UserPaysForMessagesNotice', [peerTitle.element, inlineStars]);
        text.classList.add('pinned-' + className + '-text', 'text-overflow-no-wrap');

        return (
          <div class={'pinned-' + className + '-content'}>
            {text}
            <TopbarPlate.PrimaryButton
              onClick={async() => {
                await openRemoveFeePopup({
                  parentPeerId: a().monoforumThreadId ? a().peerId : undefined,
                  peerId: a().monoforumThreadId || a().peerId,
                  managers: props.chat.managers
                });
                props.hide();
              }}
            >
              {i18n('PaidMessages.RemoveFee')}
            </TopbarPlate.PrimaryButton>
          </div>
        );
      }}
    </Show>
  );
}

export default function createChatRemoveFeePlate(
  topbar: ChatTopbar,
  chat: Chat,
  managers: AppManagers
): ChatRemoveFeePlate {
  const [args, setArgs] = createSignal<SetArgs | undefined>();

  const plate = createTopbarPlate({
    modifier: className,
    height: 74,
    onVisibilityChange: () => topbar.setFloating(),
    render: () => <RemoveFeePlateBody args={args} chat={chat} hide={() => hide()} />
  });

  const show = (next: SetArgs) => {
    setArgs(next);
    plate.setHidden(false);
  };

  const hide = () => {
    plate.setHidden(true);
    setArgs(undefined);
  };

  const setPeerId = async(peerId: PeerId) => {
    if(chat.isMonoforum && chat.canManageDirectMessages && chat.monoforumThreadId) {
      const {ackedChat, ackedDialog} = await namedPromises({
        ackedChat: managers.acknowledged.appChatsManager.getChat(peerId.toChatId()),
        ackedDialog: managers.acknowledged.monoforumDialogsStorage.getDialogByParent(peerId, chat.monoforumThreadId)
      });

      return {
        cached: ackedChat.cached && ackedDialog.cached,
        result: callbackify(Promise.all([ackedChat.result, ackedDialog.result]), ([chatPeer, dialog]) => {
          const starsCharged = chatPeer?._ === 'channel' && +chatPeer.send_paid_messages_stars;
          if(!starsCharged || dialog?.pFlags?.nopaid_messages_exception) return hide;
          return () => show({peerId, starsCharged, monoforumThreadId: chat.monoforumThreadId});
        })
      };
    }

    if(!peerId.isUser()) return {
      cached: true,
      result: Promise.resolve(hide)
    };

    const ackedFullUser = await managers.acknowledged.appProfileManager.getProfile(peerId.toUserId());

    return {
      cached: ackedFullUser.cached,
      result: callbackify(ackedFullUser.result, (fullUser) => {
        const starsCharged = +fullUser?.settings?.charge_paid_message_stars;
        if(!starsCharged) return hide;
        return () => show({peerId, starsCharged});
      })
    };
  };

  return {
    ...plate,
    setPeerId,
    hide
  };
}

type OpenRemoveFeePopupArgs = {
  peerId: PeerId,
  parentPeerId?: PeerId,
  requirePayment?: boolean,
  managers: AppManagers
};

export async function openRemoveFeePopup({peerId, parentPeerId, managers, requirePayment}: OpenRemoveFeePopupArgs) {
  const userId = peerId.toUserId();
  const revenue = !requirePayment ? await managers.appUsersManager.getPaidMessagesRevenue({userId, parentPeerId}) : undefined;

  const shouldRefund = await confirmationPopup({
    titleLangKey: requirePayment ? 'PaidMessages.ChargeFee' : 'PaidMessages.RemoveFee',
    descriptionLangKey: requirePayment ? 'PaidMessages.ChargeFeeWarning' : 'PaidMessages.RemoveFeeWarning',
    descriptionLangArgs: [await wrapPeerTitle({peerId, onlyFirstName: true})],
    checkbox: revenue ? {
      text: 'PaidMessages.RemoveFeeRefund',
      textArgs: [i18n('Stars', [revenue])]
    } : undefined,
    button: {
      langKey: 'Confirm'
    }
  });

  await managers.appUsersManager.toggleNoPaidMessagesException({userId, refundCharged: shouldRefund, parentPeerId, requirePayment});
}
