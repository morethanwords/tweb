import {createEffect, createMemo, createSignal, onCleanup} from 'solid-js';
import PopupElement from './indexTsx';
import {MyStarGift} from '../../lib/appManagers/appGiftsManager';
import {StarGift, StarGiftAttribute} from '../../layer';
import {randomItemExcept} from '../../helpers/array/randomItem';
import {i18n} from '../../lib/langPack';
import {IconTsx} from '../iconTsx';
import {I18nTsx} from '../../helpers/solid/i18n';
import {StarGiftBackdrop} from '../stargifts/stargiftBackdrop';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import wrapSticker from '../wrappers/sticker';
import RLottiePlayer from '../../lib/rlottie/rlottiePlayer';
import Row from '../rowTsx';
import CheckboxFieldTsx from '../checkboxFieldTsx';
import {ButtonIconTsx} from '../buttonIconTsx';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import {STARS_CURRENCY} from '../../lib/mtproto/mtproto_config';
import PopupPayment from './payment';
import wrapPeerTitle from '../wrappers/peerTitle';
import rootScope from '../../lib/rootScope';
import {createPopup} from './indexTsx';
import createMiddleware from '../../helpers/solid/createMiddleware';
import deferredPromise from '../../helpers/cancellablePromise';
import tsNow from '../../helpers/tsNow';
import formatDuration from '../../helpers/formatDuration';
import {wrapFormattedDuration, wrapLeftDuration} from '../wrappers/wrapDuration';
import {AnimatedCounter} from '../animatedCounter';
import Icon from '../icon';
import {createStarGiftUpgradePricePopup} from './starGiftUpgradePrice';

export default async function createStarGiftUpgradePopup(props: {
  gift: MyStarGift,
  descriptionForPeerId?: PeerId
}) {
  const [
    preview,
    peerTitle
  ] = await Promise.all([
    rootScope.managers.appGiftsManager.getUpgradePreview(props.gift.raw.id),
    props.descriptionForPeerId ? wrapPeerTitle({peerId: props.descriptionForPeerId}) : undefined
  ]);

  console.log(preview)

  const [show, setShow] = createSignal(true);

  const freeUpgrade = props.gift.isUpgradedBySender;

  const keepInfoSignal = createSignal(true);

  const [model, setModel] = createSignal<StarGiftAttribute.starGiftAttributeModel>();
  const [backdrop, setBackdrop] = createSignal<StarGiftAttribute.starGiftAttributeBackdrop>();
  const [pattern, setPattern] = createSignal<StarGiftAttribute.starGiftAttributePattern>();

  const randomize = () => {
    setModel(v => randomItemExcept(preview.models, v));
    setBackdrop(v => randomItemExcept(preview.backdrops, v));
    setPattern(v => randomItemExcept(preview.patterns, v));
  };
  randomize();

  async function handleUpgrade(): Promise<boolean> {
    if(freeUpgrade) {
      await rootScope.managers.appGiftsManager.upgradeStarGift(
        props.gift.input,
        keepInfoSignal[0]()
      );
      return true
    }

    const deferred = deferredPromise<boolean>()

    PopupPayment.create({
      inputInvoice: {
        _: 'inputInvoiceStarGiftUpgrade',
        stargift: props.gift.input,
        pFlags: {
          keep_original_details: keepInfoSignal[0]() ? true : undefined
        }
      },
      noShowIfStars: true
    }).then((popup) => {
      popup.addEventListener('finish', (result) => {
        if(result === 'paid') {
          setShow(false);
          deferred.resolve(true);
        } else {
          deferred.resolve(false);
        }
      });
    });

    return deferred;
  }

  const [now, setNow] = createSignal(tsNow(true))
  const [nextPrices, setNextPrices] = createSignal(preview.next_prices)
  // todo if freeUpgrade
  const interval = setInterval(() => setNow(tsNow(true)), 1000)

  const currentPriceIdx = createMemo(() => {
    const now$ = now()
    // the array is expected to be sorted by date ascending
    const nextPrices$ = nextPrices()
    for(let i = nextPrices$.length - 1; i >= 0; i--) {
      if(nextPrices$[i].date <= now$) {
        return i
      }
    }
    return 0
  })

  const hasFuturePrices = () => currentPriceIdx() < nextPrices().length - 1

  const currentPrice = () => nextPrices()[currentPriceIdx()]
  const currentPriceRemains = () => {
    const nextPrice = nextPrices()[currentPriceIdx() + 1]
    return nextPrice ? nextPrice.date - now() : 0
  }

  const priceCounter = new AnimatedCounter({
    reverse: true,
    duration: 1000
  })
  createEffect(() => priceCounter.setCount(Number(currentPrice().upgrade_stars)))

  createPopup(() => {
    const middleware = createMiddleware()
    onCleanup(() => clearInterval(interval))

    createEffect(() => {
      const model$ = model();

      wrapSticker({
        doc: model$.document as MyDocument,
        div: stickerContainer,
        width: 120,
        height: 120,
        play: true,
        loop: false,
        middleware: middleware.get()
      }).then(({render}) => render).then((player_) => {
        const player = player_ as RLottiePlayer;
        player.playOrRestart();
        player.addEventListener('enterFrame', (frameNo) => {
          if(frameNo === player.maxFrame) {
            player.stop(false);
            randomize();
          }
        });
      });
    });

    let stickerContainer!: HTMLDivElement;

    return (
      <PopupElement class="popup-star-gift-upgrade" show={show()}>
        <PopupElement.Body>
          <div class="popup-star-gift-upgrade-container">
            <div class="popup-star-gift-upgrade-header">
              <StarGiftBackdrop
                class="popup-star-gift-upgrade-backdrop"
                backdrop={backdrop()}
                patternEmoji={pattern().document as MyDocument}
              />
              <ButtonIconTsx
                class="popup-star-gift-upgrade-close"
                icon="close"
                onClick={() => setShow(false)}
              />
              <div
                class="popup-star-gift-upgrade-sticker"
                ref={stickerContainer}
              />
              <div class="popup-star-gift-upgrade-title">
                {i18n(props.descriptionForPeerId ? 'StarGiftUpgradeTitleFor' : 'StarGiftUpgradeTitle')}
              </div>
              <div class="popup-star-gift-upgrade-subtitle">
                {i18n(props.descriptionForPeerId ? 'StarGiftUpgradeSubtitleFor' : 'StarGiftUpgradeSubtitle', [peerTitle])}
              </div>
            </div>
            <div class="popup-star-gift-upgrade-body">
              <div class="popup-star-gift-upgrade-feature">
                <IconTsx class="popup-star-gift-upgrade-feature-icon" icon="gem" />
                <div class="popup-star-gift-upgrade-feature-body">
                  <I18nTsx class="popup-star-gift-upgrade-feature-title" key="StarGiftUpgradeUniqueTitle" />
                  <I18nTsx class="popup-star-gift-upgrade-feature-text" key="StarGiftUpgradeUniqueText" />
                </div>
              </div>
              <div class="popup-star-gift-upgrade-feature">
                <IconTsx class="popup-star-gift-upgrade-feature-icon" icon="gem_exchange" />
                <div class="popup-star-gift-upgrade-feature-body">
                  <I18nTsx class="popup-star-gift-upgrade-feature-title" key="StarGiftUpgradeTransferableTitle" />
                  <I18nTsx class="popup-star-gift-upgrade-feature-text" key="StarGiftUpgradeTransferableText" />
                </div>
              </div>
              <div class="popup-star-gift-upgrade-feature">
                <IconTsx class="popup-star-gift-upgrade-feature-icon" icon="trade" />
                <div class="popup-star-gift-upgrade-feature-body">
                  <I18nTsx class="popup-star-gift-upgrade-feature-title" key="StarGiftUpgradeTradableTitle" />
                  <I18nTsx class="popup-star-gift-upgrade-feature-text" key="StarGiftUpgradeTradableText" />
                </div>
              </div>
            </div>
            {!props.descriptionForPeerId && (
              <div class="popup-star-gift-upgrade-footer">
                <Row>
                  <Row.CheckboxField>
                    <CheckboxFieldTsx
                      text="StarGiftUpgradeKeepInfo"
                      signal={keepInfoSignal}
                    />
                  </Row.CheckboxField>
                </Row>
              </div>
            )}
          </div>
        </PopupElement.Body>
        <PopupElement.Footer>
          {props.descriptionForPeerId ? (
            <PopupElement.FooterButton
              langKey="OK"
              callback={() => setShow(false)}
            />
          ) : (
            <PopupElement.FooterButton callback={handleUpgrade}>
              <I18nTsx
                key={freeUpgrade ? 'StarGiftUpgradeFree' : 'StarGiftUpgrade'}
                args={freeUpgrade ? [] : [
                  <span class="popup-star-gift-upgrade-price-wrap">
                    <IconTsx icon="star" class="currency-star-icon" />
                    {priceCounter.container}
                  </span>
                ]}
              />
              {!freeUpgrade && hasFuturePrices() && (
                <I18nTsx
                  class="popup-star-gift-upgrade-price-decrease"
                  key="StarGiftPriceDecrease"
                  args={[wrapLeftDuration(currentPriceRemains())]}
                />
              )}
            </PopupElement.FooterButton>
          )}
          {hasFuturePrices() && (
            <div
              class="popup-star-gift-upgrade-price-decrease-link"
              onClick={() => createStarGiftUpgradePricePopup({preview})}
            >
              <I18nTsx key="StarGiftPriceDecreaseLink" />
              <IconTsx icon="next" />
            </div>
          )}
        </PopupElement.Footer>
      </PopupElement>
    );
  })
}
