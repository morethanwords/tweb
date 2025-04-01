import {createMemo, onMount} from 'solid-js';
import PopupElement from '.';
import {Message, MessageAction, StarGift} from '../../layer';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import wrapSticker, {StickerTsx} from '../wrappers/sticker';
import {i18n} from '../../lib/langPack';
import {StarsStar} from './stars';
import {AvatarNewTsx} from '../avatarNew';
import {PeerTitleTsx} from '../peerTitleTsx';
import Button from '../buttonTsx';
import {formatDateAccordingToTodayNew, formatTime} from '../../helpers/date';
import appImManager from '../../lib/appManagers/appImManager';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import {MyStarGift} from '../../lib/appManagers/appGiftsManager';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import numberThousandSplitter from '../../helpers/number/numberThousandSplitter';
import SendGiftPopup from './sendGift';
import Table, {TableButton, TablePeer, TableRow} from '../table';
import {NULL_PEER_ID} from '../../lib/mtproto/mtproto_config';
import rootScope from '../../lib/rootScope';
import {toastNew} from '../toast';

export default class PopupStarGiftInfo extends PopupElement {
  constructor(
    private gift: MyStarGift,
  ) {
    super('popup-star-gift-info', {
      closable: true,
      overlayClosable: true,
      body: true,
      footer: true,
      withConfirm: 'OK',
      withFooterConfirm: true
    });

    this.construct();
  }

  private _construct() {
    const {saved, raw: gift, sticker, isIncoming, isConverted, input} = this.gift;

    console.log('meow', this.gift);
    const isUnavailable = !saved && (gift as StarGift.starGift).availability_remains === 0;
    const fromId = saved ? getPeerId(saved.from_id) : NULL_PEER_ID;
    const date = saved ? new Date(saved.date * 1000) : null;
    const firstSaleDate = (gift as StarGift.starGift).first_sale_date ? (new Date((gift as StarGift.starGift).first_sale_date * 1000)) : null;
    const lastSaleDate = (gift as StarGift.starGift).last_sale_date ? (new Date((gift as StarGift.starGift).last_sale_date * 1000)) : null;
    const starsValue = (gift as StarGift.starGift).stars;

    if(isIncoming && !saved.pFlags.can_upgrade && !isConverted) {
      // todo: handle collectible gifts
      this.btnConfirm.replaceChildren(i18n(saved.pFlags.unsaved ? 'StarGiftDisplayOnMyPage' : 'StarGiftHideFromMyPage'));
      let loading = false;
      attachClickEvent(this.btnConfirm, () => {
        if(loading) return;
        loading = true;
        this.managers.appGiftsManager.toggleGiftHidden(input, !saved.pFlags.unsaved).then(() => {
          this.hide();
        });
      });
    } else {
      attachClickEvent(this.btnConfirm, () => this.hide());
    }

    const tableContent = createMemo(() => {
      const rows: TableRow[] = []

      if(fromId !== NULL_PEER_ID) {
        rows.push([
          'StarGiftFromShort',
          <>
            <TablePeer peerId={fromId} />
            <TableButton
              text="StarGiftSendInline"
              onClick={() => {
                this.hide();
                PopupElement.createPopup(SendGiftPopup, fromId);
              }}
            />
          </>
        ])
      }

      if(date) {
        rows.push([
          'StarGiftDate',
          i18n('formatDateAtTime', [
            formatDateAccordingToTodayNew(date),
            formatTime(date)
          ])
        ])
      }

      if(isUnavailable) {
        if(firstSaleDate) {
          rows.push([
            'StarGiftUnavailableFirstSale',
            i18n('formatDateAtTime', [
              formatDateAccordingToTodayNew(firstSaleDate),
              formatTime(firstSaleDate)
            ])
          ])
        }

        if(lastSaleDate) {
          rows.push([
            'StarGiftUnavailableLastSale',
            i18n('formatDateAtTime', [
              formatDateAccordingToTodayNew(lastSaleDate),
              formatTime(lastSaleDate)
            ])
          ])
        }
      }

      rows.push([
        'StarGiftValue',
        <>
          <StarsStar />
          {starsValue}
          {saved?.convert_stars && !isConverted && (
            <TableButton
              text="StarGiftConvertButton"
              textArgs={[saved.convert_stars]}
              onClick={() => {
                rootScope.managers.appGiftsManager.convertGift(input)
                .then(() => {
                  this.hide()
                }).catch(() => {
                  toastNew({langPackKey: 'Error.AnError'})
                })
              }}
            />
          )}
        </>
      ])

      if(gift.availability_total > 0) {
        rows.push([
          'StarGiftAvailability',
          i18n('StarGiftAvailabilityValue', [
            (gift as StarGift.starGift).availability_remains ?? 0,
            numberThousandSplitter(gift.availability_total)
          ])
        ])
      }

      return rows;
    })

    return (
      <div class="popup-star-gift-info-container">
        <StickerTsx
          class="popup-star-gift-info-sticker"
          sticker={sticker}
          width={120}
          height={120}
          extraOptions={{play: true, loop: false}}
        />
        <div class="popup-star-gift-info-title">
          {i18n(isUnavailable ? 'StarGiftUnavailableTitle' : isIncoming ? 'StarGiftReceivedTitle' : 'StarGiftTitle')}
        </div>
        {isUnavailable ? (
          <div class="popup-star-gift-info-subtitle-unavailable">
            {i18n('StarGiftUnavailableSubtitle')}
          </div>
        ) : (
          <div class="popup-star-gift-info-price">
            <StarsStar />
            {starsValue}
          </div>
        )}
        {isIncoming && (
          <div class="popup-star-gift-info-subtitle">
            {i18n('StarGiftReceivedSubtitle', [saved.convert_stars])}
            {' '}
            <a href="https://telegram.org/blog/telegram-stars" target="_blank">
              {i18n('StarGiftReceivedSubtitleLink')}
            </a>
          </div>
        )}

        <Table
          class="popup-star-gift-info-table"
          content={tableContent()}
          footer={saved?.message && wrapRichText(saved.message.text, {entities: saved.message.entities})}
        />

        {isIncoming && !saved.pFlags.can_upgrade && (
          <div class="popup-star-gift-info-hint">
            {saved.pFlags.unsaved ? i18n('StarGiftHiddenHint') : (
              <>
                {i18n('StarGiftVisibleHint')}
                <a href="#">
                  {i18n('StarGiftVisibleHintLink')}
                </a>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  private async construct() {
    this.appendSolid(() => this._construct());
    this.show();
  }
}
