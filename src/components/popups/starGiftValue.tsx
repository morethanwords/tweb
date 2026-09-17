import {createEffect, createMemo, createSignal, JSX, on, onMount} from 'solid-js';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {MyStarGift} from '@appManagers/appGiftsManager';

import styles from '@components/popups/starGiftValue.module.scss';
import {PaymentsUniqueStarGiftValueInfo, StarGift} from '@layer';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import {StickerTsx} from '@components/wrappers/sticker';
import MediaHeader from '@components/mediaHeader';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import {I18nTsx} from '@helpers/solid/i18n';
import Table, {TableButton, TableButtonWithTooltip, TableRow} from '@components/table';
import {formatFullSentTime} from '@helpers/date';
import {StarsStar} from '@components/popups/stars';
import {numberThousandSplitterForStars} from '@helpers/number/numberThousandSplitter';
import bigInt from 'big-integer';
import {i18n} from '@lib/langPack';
import {IconTsx} from '@components/iconTsx';
import safeWindowOpen from '@helpers/dom/safeWindowOpen';
import showSendGiftPopup from '@components/popups/sendGift';
import rootScope from '@lib/rootScope';

export default function showStarGiftValuePopup(options: {
  gift: MyStarGift,
  value: PaymentsUniqueStarGiftValueInfo
}) {
  const myGift = options.gift;
  const [show, setShow] = createSignal(true);

  createPopup(() => {
    const value = options.value;
    const gift = myGift.raw as StarGift.starGiftUnique;

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
      <PopupElement class={styles.popup} closable show={show()} old>
        <PopupElement.Header floating>
          <PopupElement.CloseButton />
        </PopupElement.Header>
        <PopupElement.Body>
          <StickerTsx
            class={/* @once */ styles.sticker}
            sticker={myGift.sticker}
            width={120}
            height={120}
            autoStyle
            extraOptions={{play: true, loop: false}}
          />

          <div class={/* @once */ styles.value}>
            {paymentsWrapCurrencyAmount(value.value, value.currency)}
          </div>

          <MediaHeader.Subtitle>
            <I18nTsx
              key={
                value.pFlags.value_is_average ? 'StarGiftValueAboutAverage' :
                value.pFlags.last_sale_on_fragment ? 'StarGiftValueAboutLastFragment' :
                'StarGiftValueAboutLastTelegram'
              }
              args={[gift.title]}
            />
          </MediaHeader.Subtitle>

          <div class={/* @once */ styles.table}>
            <Table
              content={tableContent()}
              cellClass="popup-star-gift-info-table-cell"
              footerClass={gift._ === 'starGiftUnique' ? 'popup-star-gift-info-footer-unique' : undefined}
            />
          </div>

        </PopupElement.Body>
        <PopupElement.Footer class={/* @once */ styles.footer}>
          {!!value.listed_count && (
            <PopupElement.FooterButton
              color="secondary"
              callback={() => showSendGiftPopup({
                peerId: rootScope.myId,
                resaleParams: {
                  giftId: gift.gift_id
                }
              })}
            >
              <I18nTsx
                key="StarGiftViewResaleTelegram"
                args={[
                  <span>
                    {value.listed_count}
                    <StickerTsx
                      sticker={myGift.sticker}
                      width={24}
                      height={24}
                      autoStyle
                      extraOptions={{play: false}}
                    />
                  </span>,
                  <IconTsx icon="next" />
                ]}
              />
            </PopupElement.FooterButton>
          )}
          {!!value.fragment_listed_count && (
            <PopupElement.FooterButton
              color="secondary"
              callback={() => safeWindowOpen(value.fragment_listed_url)}
            >
              <I18nTsx
                key="StarGiftViewResaleFragment"
                args={[
                  <span>
                    {value.fragment_listed_count}
                    <StickerTsx
                      sticker={myGift.sticker}
                      width={24}
                      height={24}
                      autoStyle
                      extraOptions={{play: false}}
                    />
                  </span>,
                  <IconTsx icon="next" />
                ]}
              />
            </PopupElement.FooterButton>
          )}
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
