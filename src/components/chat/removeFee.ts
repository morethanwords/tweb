import callbackify from '@helpers/callbackify';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import namedPromises from '@helpers/namedPromises';
import {numberThousandSplitterForStars} from '@helpers/number/numberThousandSplitter';
import {AppManagers} from '@lib/managers';
import {i18n} from '@lib/langPack';
import Button from '@components/button';
import confirmationPopup from '@components/confirmationPopup';
import Icon from '@components/icon';
import PeerTitle from '@components/peerTitle';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import Chat from '@components/chat/chat';
import PinnedContainer from '@components/chat/pinnedContainer';
import type ChatTopbar from '@components/chat/topbar';
import {MiddlewareHelper} from '@helpers/middleware';
import {createRoot} from 'solid-js';

type SetArgs = {
  peerId: PeerId,
  monoforumThreadId?: PeerId,
  starsCharged: number
};

const className = 'remove-fee';

export default class ChatRemoveFee extends PinnedContainer {
  private middlewareHelper: MiddlewareHelper;

  constructor(protected topbar: ChatTopbar, protected chat: Chat, protected managers: AppManagers) {
    super({
      topbar,
      chat,
      listenerSetter: topbar.listenerSetter,
      className,
      height: 74
    });

    this.middlewareHelper = chat.middlewareHelper.get().create();
  }

  public hide() {
    this.toggle(true);
    this.wrapper.replaceChildren();
  }

  private hideCallback() {
    return () => {
      this.hide();
    };
  }

  private set({peerId, monoforumThreadId, starsCharged}: SetArgs) {
    this.middlewareHelper.clean();
    this.toggle(false);

    const content = document.createElement('div');
    content.classList.add('pinned-' + className + '-content');

    const inlineStars = document.createElement('span');
    inlineStars.append(
      Icon('star', 'inline-icon', 'inline-icon-left'),
      numberThousandSplitterForStars(+starsCharged)
    );

    const peerTitle = new PeerTitle();
    peerTitle.update({peerId: monoforumThreadId || peerId, onlyFirstName: true, limitSymbols: 20});

    const text = i18n('PaidMessages.UserPaysForMessagesNotice', [peerTitle.element, inlineStars]);
    text.classList.add('pinned-' + className + '-text', 'text-overflow-no-wrap');
    content.append(text);

    let button: HTMLElement;
    createRoot((dispose) => {
      this.middlewareHelper.get().onClean(dispose);
      this.createPrimaryButton({
        onClick: async() => {
          await openRemoveFeePopup({
            parentPeerId: monoforumThreadId ? peerId : undefined,
            peerId: monoforumThreadId || peerId,
            managers: this.chat.managers
          });
          this.hide();
        },
        children: i18n('PaidMessages.RemoveFee'),
        ref: (_button) => button = _button
      });
    });
    content.append(button);
    this.container.replaceChildren(content);
  }

  public async setPeerId(peerId: PeerId) {
    if(this.chat.isMonoforum && this.chat.canManageDirectMessages && this.chat.monoforumThreadId) {
      const {ackedChat, ackedDialog} = await namedPromises({
        ackedChat: this.chat.managers.acknowledged.appChatsManager.getChat(peerId.toChatId()),
        ackedDialog: this.chat.managers.acknowledged.monoforumDialogsStorage.getDialogByParent(peerId, this.chat.monoforumThreadId)
      });

      return {
        cached: ackedChat.cached && ackedDialog.cached,
        result: callbackify(Promise.all([ackedChat.result, ackedDialog.result]), ([chat, dialog]) => {
          const starsCharged = chat?._ === 'channel' && +chat.send_paid_messages_stars;
          if(!starsCharged || dialog?.pFlags?.nopaid_messages_exception) return this.hideCallback();
          return (): void => void this.set({peerId, starsCharged, monoforumThreadId: this.chat.monoforumThreadId});
        })
      };
    }

    if(!peerId.isUser()) return {
      cached: true,
      result: Promise.resolve(this.hideCallback())
    };

    const ackedFullUser = await this.chat.managers.acknowledged.appProfileManager.getProfile(peerId.toUserId());

    return {
      cached: ackedFullUser.cached,
      result: callbackify(ackedFullUser.result, (fullUser) => {
        const starsCharged = +fullUser?.settings?.charge_paid_message_stars;
        if(!starsCharged) return this.hideCallback();
        return (): void => void this.set({peerId, starsCharged});
      })
    };
  }
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
