import {createMemo, createSignal, onCleanup, onMount} from 'solid-js';
import tsNow from '@helpers/tsNow';
import {LimitLineTsx} from '@components/limitLineTsx';
import PopupElement, {createPopup} from '@components/popups/indexTsx';

import styles from '@components/popups/starGiftUpgradePrice.module.scss';
import {I18nTsx} from '@helpers/solid/i18n';
import {StarGiftUpgradePreview} from '@appManagers/appGiftsManager';
import {easeOutCircApply} from '@helpers/easing/easeOutCirc';
import Table from '@components/table';
import {formatDate, formatDateAccordingToTodayNew, formatFullSentTime, formatTime} from '@helpers/date';
import {StarsStar} from '@components/popups/stars';
import {numberThousandSplitterForStars} from '@helpers/number/numberThousandSplitter';
import I18n from '@lib/langPack';
import toHHMMSS from '@helpers/string/toHHMMSS';
import Scrollable from '@components/scrollable2';
import {fastRaf} from '@helpers/schedulers';
import {createCurrentTime} from '@helpers/solid/createCurrentTime';

export function createStarGiftUpgradePricePopup(props: {
  preview: StarGiftUpgradePreview,
}) {
  const [show, setShow] = createSignal(false);

  let minPrice = Infinity;
  let maxPrice = 0;
  for(const price of props.preview.prices) {
    const val = Number(price.upgrade_stars);
    if(val < minPrice) {
      minPrice = val;
    }
    if(val > maxPrice) {
      maxPrice = val;
    }
  }

  const now = createCurrentTime({
    fn: () => tsNow(true),
    updateInterval: 1000
  })
  const currentPriceNext = createMemo(() => {
    const now$ = now()
    for(let i = props.preview.next_prices.length - 1; i >= 0; i--) {
      if(props.preview.next_prices[i].date <= now$) {
        return props.preview.next_prices[i];
      }
    }
    return props.preview.next_prices[0];
  })
  const progress = () => easeOutCircApply((Number(currentPriceNext().upgrade_stars) - minPrice) / (maxPrice - minPrice), 1);

  const currentPriceIdx = createMemo(() => {
    const now$ = now()
    for(let i = props.preview.prices.length - 1; i >= 0; i--) {
      if(props.preview.prices[i].date <= now$) {
        return i;
      }
    }
    return 0;
  })
  const futurePrices = createMemo(() => props.preview.prices.slice(currentPriceIdx()))

  function formatDateTime(unix: number) {
    const date = new Date(unix * 1000);
    return (
      <>
        {formatTime(date)}
        {', '}
        {new I18n.IntlDateElement({
          date,
          options: {
            month: 'short',
            day: 'numeric'
          }
        }).element}
      </>
    )
  }

  return createPopup(() => {
    onMount(() => fastRaf(() => setShow(true)))
    return (
      <PopupElement class={styles.popup} containerClass={styles.popupContainer} show={show()}>
        <PopupElement.Header class={styles.popupHeader}>
          <PopupElement.CloseButton class={styles.popupCloseButton} />
        </PopupElement.Header>
        <PopupElement.Body class={styles.popupBody}>
          <Scrollable>
            <div class={styles.scrollableContent}>
              <LimitLineTsx
                class={styles.limitLine}
                progress={progress()}
                progressTo={<I18nTsx key="StarsCount" args={[String(maxPrice)]} />}
                progressFrom={<I18nTsx key="StarsCount" args={[String(minPrice)]} />}
                reverse
                hint={(
                  <span class={styles.limitLineHint}>
                    {currentPriceNext().upgrade_stars}
                  </span>
                )}
                hintIcon="star"
              />

              <I18nTsx key="StarGiftUpgradePriceTitle" class={styles.title} />
              <I18nTsx key="StarGiftUpgradePriceSubtitle" class={styles.subtitle} />

              <Table
                class={styles.table}
                keyCellClass={styles.tableKeyCell}
                content={futurePrices().map((it) => ([
                  <span>
                    {formatDateTime(it.date)}
                  </span>,
                  <span class={styles.tableValue}>
                    <StarsStar />
                    {numberThousandSplitterForStars(it.upgrade_stars)}
                  </span>
                ]))}
              />

              <I18nTsx key="StarGiftUpgradePriceAbout" class={styles.about} />
            </div>
          </Scrollable>
        </PopupElement.Body>

        <PopupElement.Footer class={styles.popupFooter}>
          <PopupElement.FooterButton
            class={styles.popupButton}
            iconLeft="okay"
            langKey="StarGiftUpgradePriceUnderstood"
            callback={() => setShow(false)}
          />
        </PopupElement.Footer>
      </PopupElement>
    );
  })
}
