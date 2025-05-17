import {numberThousandSplitterForStars} from '../../helpers/number/numberThousandSplitter';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import {AppManagers} from '../../lib/appManagers/managers';
import {i18n} from '../../lib/langPack';

import Icon from '../icon';

import PinnedContainer from './pinnedContainer';
import type ChatTopbar from './topbar';
import Chat from './chat';

import styles from './removeFee.module.scss';
import Button from '../button';
import PeerTitle from '../peerTitle';
import confirmationPopup from '../confirmationPopup';


export default class ChatRemoveFee extends PinnedContainer {
  constructor(protected topbar: ChatTopbar, protected chat: Chat, protected managers: AppManagers) {
    super({
      topbar,
      chat,
      listenerSetter: topbar.listenerSetter,
      className: 'remove-fee',
      // divAndCaption: new DivAndCaption(
      //   'pinned-requests',
      //   (options) => {
      //     // replaceContent(this.divAndCaption.title, options.title);
      //     // replaceContent(this.divAndCaption.subtitle, options.subtitle);
      //   }
      // ),
      onClose: () => {
        // apiManagerProxy.getState().then((state) => {
        //   state.hideChatJoinRequests[this.peerId] = Date.now();
        //   this.managers.appStateManager.pushToState('hideChatJoinRequests', state.hideChatJoinRequests);
        // });
      },
      floating: true,
      height: 64
    });
  }

  private hideCallback() {
    return () => {
      this.toggle(true);
      this.wrapper.replaceChildren();
    };
  }

  public async setPeerId(peerId: PeerId) {
    if(!peerId.isUser()) return this.hideCallback();

    const fullUser = await this.chat.managers.appProfileManager.getProfile(peerId.toUserId());
    const starsCharged = +fullUser?.settings?.charge_paid_message_stars;

    console.log('[my-debug] starsCharged :>> ', starsCharged);

    if(!starsCharged) return this.hideCallback();

    return () => {
      this.toggle(false);

      console.log('[my-debug] initing remove fee :>> ', starsCharged);
      const content = document.createElement('div');
      content.classList.add(styles.Content);

      const inlineStars = document.createElement('span');
      inlineStars.classList.add('inline-stars');
      inlineStars.append(
        numberThousandSplitterForStars(+starsCharged),
        Icon('star')
      );

      const peerTitle = new PeerTitle();
      peerTitle.update({peerId, onlyFirstName: true});

      content.append(i18n('PaidMessage.UserPaysForMessagesNotice', [peerTitle.element, inlineStars]));

      const button = Button(`btn primary ${styles.RemoveFeeButton}`, {text: 'PaidMessages.RemoveFee'})
      content.append(button);

      attachClickEvent(button, () => {});

      this.container.replaceChildren(content);
    };
  }

  private async openRemoveFeeModal(userId: UserId) {
    const revenue = await this.managers.appUsersManager.getPaidMessagesRevenue(userId);

    const shouldRefund = await confirmationPopup({
      titleLangKey: 'PaidMessages.RemoveFee',
      descriptionLangKey: 'PaidMessage.RemoveFeeWarning',
      checkbox: revenue ? {
        text: 'PaidMessage.RemoveFeeRefund',
        textArgs: [i18n('Stars', [revenue])]
      } : undefined,
      button: {
        langKey: 'Confirm'
      }
    });

    // if(withDontShowAgain && dontShowAgain) onNotShowAgain();
  }
}

