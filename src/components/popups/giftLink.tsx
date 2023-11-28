/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {render} from 'solid-js/web';
import PopupElement from '.';
import {PaymentsCheckedGiftCode} from '../../layer';
import renderImageFromUrl from '../../helpers/dom/renderImageFromUrl';
import {LangPackKey, i18n} from '../../lib/langPack';
import {InviteLink} from '../sidebarLeft/tabs/sharedFolder';
import {For, JSX} from 'solid-js';
import {formatFullSentTime, formatMonthsDuration} from '../../helpers/date';
import {AvatarNew} from '../avatarNew';
import {PeerTitleTsx} from '../stories/list';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import appImManager from '../../lib/appManagers/appImManager';
import rootScope from '../../lib/rootScope';
import PeerTitle from '../peerTitle';
import cancelEvent from '../../helpers/dom/cancelEvent';
import PopupPickUser from './pickUser';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import toggleDisability from '../../helpers/dom/toggleDisability';
import {toastNew} from '../toast';

export default class PopupGiftLink extends PopupElement {
  private checkedGiftCode: PaymentsCheckedGiftCode;

  constructor(private slug: string) {
    super('popup-boosts popup-gift-link', {
      closable: true,
      overlayClosable: true,
      body: true,
      withConfirm: true,
      scrollable: true,
      floatingHeader: true,
      footer: true,
      title: true
    });

    this.construct();
  }

  private _construct() {
    const titleLangKey: LangPackKey = this.checkedGiftCode.used_date ? 'BoostingUsedGiftLink' : 'BoostingGiftLink';
    this.title.replaceChildren(i18n(titleLangKey));

    const url = 't.me/giftcode/' + this.slug;

    const inviteLink = new InviteLink({
      button: false,
      listenerSetter: this.listenerSetter,
      url
    });

    const makePeer = (peerId: PeerId) => {
      const avatar = AvatarNew({peerId, size: 24});
      return (
        <div
          class="popup-gift-link-peer"
          onClick={() => {
            this.hideWithCallback(() => {
              appImManager.setInnerPeer({peerId});
            });
          }}
        >
          {avatar.element}
          <PeerTitleTsx peerId={peerId} />
        </div>
      );
    };

    const isGiveaway = this.checkedGiftCode.pFlags.via_giveaway;

    const fromPeerId = getPeerId(this.checkedGiftCode.from_id);
    const toPeerId = this.checkedGiftCode.to_id && getPeerId(this.checkedGiftCode.to_id);

    const giveawayAnchor = this.checkedGiftCode.giveaway_msg_id || isGiveaway ? document.createElement('a') : undefined;
    if(giveawayAnchor) {
      giveawayAnchor.href = '#';
      giveawayAnchor.append(i18n('BoostingIncompleteGiveaway'));
      attachClickEvent(giveawayAnchor, () => {
        this.hideWithCallback(() => {
          appImManager.setInnerPeer({
            peerId: fromPeerId,
            lastMsgId: this.checkedGiftCode.giveaway_msg_id
          });
        });
      }, {listenerSetter: this.listenerSetter});
    }

    const reasonValue = toPeerId ? (
      toPeerId === rootScope.myId ?
        i18n('BoostingYouWereSelected') :
        i18n('BoostingUserWasSelected', [new PeerTitle({peerId: toPeerId}).element])
    ) : giveawayAnchor;

    const content: [LangPackKey, JSX.Element][] = [
      ['BoostingFrom', makePeer(fromPeerId)],
      ['BoostingTo', toPeerId ? makePeer(toPeerId) : i18n('BoostingNoRecipient')],
      ['BoostingGift', i18n('BoostingTelegramPremiumFor', [formatMonthsDuration(this.checkedGiftCode.months)])],
      ['BoostingReason', reasonValue],
      ['BoostingDate', formatFullSentTime(this.checkedGiftCode.date, undefined, true)]
    ];

    const shareLink = document.createElement('a');
    shareLink.href = '#';
    shareLink.onclick = (e) => {
      cancelEvent(e);
      this.hideWithCallback(() => {
        PopupPickUser.createSharingPicker({
          onSelect: (peerId) => {
            rootScope.managers.appMessagesManager.sendText({peerId, text: url});
            appImManager.setInnerPeer({peerId});
          }
        });
      });
    };

    let img: HTMLImageElement;
    const ret = (
      <div class="popup-gift-link-wrapper">
        <div class="popup-gift-link-header">
          <img ref={img} class="popup-gift-link-image" />
          <div class="popup-gift-link-title">{i18n(titleLangKey)}</div>
          <div class="popup-gift-link-subtitle">
            {
              this.checkedGiftCode.used_date ?
                i18n('BoostingLinkUsed') :
                i18n(toPeerId === rootScope.myId ? 'BoostingLinkAllows' : (toPeerId ? 'BoostingLinkAllowsToUser' : 'BoostingLinkAllowsAnyone'), toPeerId ? [new PeerTitle({peerId: toPeerId}).element] : undefined)
            }
          </div>
        </div>
        {inviteLink.container}
        <table class="popup-gift-link-table">
          <For each={content}>
            {([key, value]) => {
              return (
                <tr class="popup-gift-link-table-row">
                  <td class="popup-gift-link-table-cell popup-gift-link-table-key">{i18n(key)}</td>
                  <td class="popup-gift-link-table-cell">{value}</td>
                </tr>
              );
            }}
          </For>
        </table>
        <div class="popup-gift-link-share">
          {this.checkedGiftCode.used_date ?
            i18n('BoostingUsedLinkDate', [formatFullSentTime(this.checkedGiftCode.used_date, undefined, true)]) :
            i18n(toPeerId ? 'Giveaway.SendLinkToFriend' : 'Giveaway.SendLinkToAnyone', [shareLink])
          }
        </div>
      </div>
    );

    renderImageFromUrl(img, `assets/img/premium-star${window.devicePixelRatio > 1 ? '@2x' : ''}.png`);

    this.btnConfirm.append(i18n(this.checkedGiftCode.used_date ? 'OK' : 'BoostingUseLink'));
    this.btnConfirm.classList.add('popup-boosts-button');
    this.footer.append(this.btnConfirm);
    this.body.after(this.footer);
    this.footer.classList.add('abitlarger');

    attachClickEvent(this.btnConfirm, async() => {
      if(this.checkedGiftCode.used_date) {
        this.hide();
        return;
      }

      const toggle = toggleDisability(this.btnConfirm, true);
      try {
        await this.managers.appPaymentsManager.applyGiftCode(this.slug);
        this.hide();
        toastNew({langPackKey: 'GiftLink.UseSuccess'});
      } catch(err) {
        console.error('giftcode error', err);
        toggle();
      }
    }, {listenerSetter: this.listenerSetter});

    return ret;
  }

  private async construct() {
    this.checkedGiftCode = await this.managers.appPaymentsManager.checkGiftCode(this.slug);
    const div = document.createElement('div');
    this.scrollable.append(div, this.btnConfirm);
    const dispose = render(() => this._construct(), div);
    this.addEventListener('closeAfterTimeout', dispose);
    this.show();
  }
}
