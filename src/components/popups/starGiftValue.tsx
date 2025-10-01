import {createEffect, createMemo, createSignal, JSX, on, onMount} from 'solid-js';
import PopupElement from '.';
import safeAssign from '../../helpers/object/safeAssign';
import {MyStarGift} from '../../lib/appManagers/appGiftsManager';

import styles from './starGiftValue.module.scss';
import {PaymentsUniqueStarGiftValueInfo, StarGift} from '../../layer';
import {ButtonIconTsx} from '../buttonIconTsx';
import {StickerTsx} from '../wrappers/sticker';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import {I18nTsx} from '../../helpers/solid/i18n';
import Table, {TableButton, TableButtonWithTooltip, TableRow} from '../table';
import {formatFullSentTime} from '../../helpers/date';
import {StarsStar} from './stars';
import {numberThousandSplitterForStars} from '../../helpers/number/numberThousandSplitter';
import bigInt from 'big-integer';
import {i18n} from '../../lib/langPack';
import Button from '../buttonTsx';
import {IconTsx} from '../iconTsx';
import safeWindowOpen from '../../helpers/dom/safeWindowOpen';
import PopupSendGift from './sendGift';
import rootScope from '../../lib/rootScope';
import ripple from '../ripple';

export default class PopupStarGiftValue extends PopupElement {
  private gift: MyStarGift;
  private value: PaymentsUniqueStarGiftValueInfo;
  constructor(options: {
    gift: MyStarGift,
    value: PaymentsUniqueStarGiftValueInfo
  }) {
    super(styles.popup, {
      closable: true,
      overlayClosable: true,
      body: true,
      footer: false
    });

    this.header.remove()

    safeAssign(this, options);

    this.construct()
  }

  private construct() {
    this.appendSolidBody(() => this._construct())
  }

  protected _construct() {
    const value = this.value;
    const gift = this.gift.raw as StarGift.starGiftUnique;

    const tableContent = createMemo(() => {
      const rows: TableRow[] = [];

      if(value.initial_sale_date) {
        rows.push([
          'StarGiftInitialSale',
          <span>{formatFullSentTime(value.initial_sale_date)}</span>
        ]);
      }

      rows.push([
        'StarGiftInitialPrice',
        <span>
          <StarsStar />
          <I18nTsx
            key="StarGiftInitialPriceValue"
            args={[
              numberThousandSplitterForStars(value.initial_sale_stars),
              paymentsWrapCurrencyAmount(value.initial_sale_price, value.currency)
            ]}
          />
        </span>
      ])

      if(value.last_sale_date) {
        rows.push([
          'StarGiftLastSale',
          <span>{formatFullSentTime(value.last_sale_date)}</span>
        ]);
      }

      if(value.last_sale_price) {
        const diff = bigInt(value.last_sale_price as string)
        .minus(value.initial_sale_price)
        .multiply(100)
        .divide(value.initial_sale_price).toJSNumber()

        rows.push([
          'StarGiftLastPrice',
          <>
            <span>
              <StarsStar />
              {paymentsWrapCurrencyAmount(value.last_sale_price, value.currency)}
            </span>
            <TableButton>
              {diff > 0 ? '+' : ''}{Math.round(diff)}%
            </TableButton>
          </>
        ])
      }

      if(value.floor_price) {
        rows.push([
          'StarGiftMinimumPrice',
          <>
            {paymentsWrapCurrencyAmount(value.floor_price, value.currency)}
            <TableButtonWithTooltip
              tooltipTextElement={i18n('StarGiftMinimumPriceTooltip', [
                paymentsWrapCurrencyAmount(value.floor_price, value.currency),
                gift.title
              ])}
            >
              ?
            </TableButtonWithTooltip>
          </>
        ]);
      }

      if(value.average_price) {
        rows.push([
          'StarGiftAveragePrice',
          <>
            {paymentsWrapCurrencyAmount(value.average_price, value.currency)}
            <TableButtonWithTooltip
              tooltipTextElement={i18n('StarGiftAveragePriceTooltip', [
                paymentsWrapCurrencyAmount(value.average_price, value.currency),
                gift.title
              ])}
            >
              ?
            </TableButtonWithTooltip>
          </>
        ]);
      }

      return rows;
    });

    return (
      <>
        <ButtonIconTsx
          class={/* @once */ styles.close}
          icon="close"
          onClick={() => this.hide()}
        />

        <StickerTsx
          class={/* @once */ styles.sticker}
          sticker={this.gift.sticker}
          width={120}
          height={120}
          autoStyle
          extraOptions={{play: true, loop: false}}
        />

        <div class={/* @once */ styles.value}>
          {paymentsWrapCurrencyAmount(value.value, value.currency)}
        </div>

        <I18nTsx
          class={/* @once */ styles.about}
          key={
            value.pFlags.value_is_average ? 'StarGiftValueAboutAverage' :
            value.pFlags.last_sale_on_fragment ? 'StarGiftValueAboutLastFragment' :
            'StarGiftValueAboutLastTelegram'
          }
          args={[gift.title]}
        />

        <div class={/* @once */ styles.table}>
          <Table
            content={tableContent()}
            cellClass="popup-star-gift-info-table-cell"
            footerClass={gift._ === 'starGiftUnique' ? 'popup-star-gift-info-footer-unique' : undefined}
          />
        </div>

        <div class={/* @once */ styles.footer}>
          {value.listed_count && (
            <Button
              ref={ripple}
              class="rp-overflow btn-transparent primary"
              onClick={() => PopupElement.createPopup(PopupSendGift, {
                peerId: rootScope.myId,
                resaleForGift: gift.gift_id
              })}
            >
              <I18nTsx
                key="StarGiftViewResaleTelegram"
                args={[
                  <span>
                    {value.listed_count}
                    <StickerTsx
                      sticker={this.gift.sticker}
                      width={24}
                      height={24}
                      autoStyle
                      extraOptions={{play: false}}
                    />
                  </span>,
                  <IconTsx icon="next" />
                ]}
              />
            </Button>
          )}
          {value.fragment_listed_count && (
            <Button
              ref={ripple}
              class="rp-overflow btn-transparent primary"
              onClick={() => safeWindowOpen(value.fragment_listed_url)}
            >
              <I18nTsx
                key="StarGiftViewResaleFragment"
                args={[
                  <span>
                    {value.fragment_listed_count}
                    <StickerTsx
                      sticker={this.gift.sticker}
                      width={24}
                      height={24}
                      autoStyle
                      extraOptions={{play: false}}
                    />
                  </span>,
                  <IconTsx icon="next" />
                ]}
              />
            </Button>
          )}
        </div>
      </>
    )
  }
}
