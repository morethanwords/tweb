import {createEffect, createMemo, createSignal, onCleanup} from 'solid-js';
import PopupElement from '@components/popups/indexTsx';
import PopupElementOld from '@components/popups/index'
import {MyStarGift} from '@appManagers/appGiftsManager';
import {StarGiftAttribute} from '@layer';
import {randomItemExcept} from '@helpers/array/randomItem';
import {i18n} from '@lib/langPack';
import {IconTsx} from '@components/iconTsx';
import {I18nTsx} from '@helpers/solid/i18n';
import {StarGiftBackdrop} from '@components/stargifts/stargiftBackdrop';
import {MyDocument} from '@appManagers/appDocsManager';
import wrapSticker from '@components/wrappers/sticker';
import RLottiePlayer from '@lib/rlottie/rlottiePlayer';
import Row from '@components/rowTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import PopupPayment from '@components/popups/payment';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import rootScope from '@lib/rootScope';
import {createPopup} from '@components/popups/indexTsx';
import createMiddleware from '@helpers/solid/createMiddleware';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import tsNow from '@helpers/tsNow';
import {wrapLeftDuration} from '@components/wrappers/wrapDuration';
import {AnimatedCounter} from '@components/animatedCounter';
import {createStarGiftUpgradePricePopup} from '@components/popups/starGiftUpgradePrice';
import PopupStarGiftInfo from '@components/popups/starGiftInfo';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {createCurrentTime} from '@helpers/solid/createCurrentTime';

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

  const [show, setShow] = createSignal(true);
  let upgradePromise: CancellablePromise<boolean> | undefined

  const freeUpgrade = props.gift.isUpgradedBySender;
  const canPrepay = props.gift.saved?.prepaid_upgrade_hash !== undefined;

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
    if(props.descriptionForPeerId && canPrepay) {
      const deferred = deferredPromise<boolean>();
      PopupPayment.create({
        inputInvoice: {
          _: 'inputInvoiceStarGiftPrepaidUpgrade',
          hash: props.gift.saved?.prepaid_upgrade_hash,
          peer: await rootScope.managers.appPeersManager.getInputPeerById(props.descriptionForPeerId)
        },
        noShowIfStars: true
      }).then((popup) => {
        popup.addEventListener('finish', (result) => {
          deferred.resolve(result === 'paid');
        });
      });
      return deferred;
    }

    upgradePromise = deferredPromise<boolean>();

    if(freeUpgrade) {
      await rootScope.managers.appGiftsManager.upgradeStarGift(
        props.gift.input,
        keepInfoSignal[0]()
      );
      return upgradePromise
    }

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
        if(result !== 'paid') {
          upgradePromise.resolve(false);
        }
      });
    });

    return upgradePromise;
  }

  const now = createCurrentTime({
    fn: () => tsNow(true),
    updateInterval: 1000
  })
  const [nextPrices, setNextPrices] = createSignal(preview.next_prices)

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

    subscribeOn(rootScope)('star_gift_upgrade', (event) => {
      if(!upgradePromise) return;
      if(!(event.savedId === props.gift.saved?.saved_id || event.fromMsgId === props.gift.saved?.msg_id)) return

      PopupElementOld.createPopup(PopupStarGiftInfo, {
        gift: event.gift,
        upgradeAnimation: preview
      })
      upgradePromise.resolve(true)
    })

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
                  <I18nTsx
                    class="popup-star-gift-upgrade-feature-text"
                    key={props.descriptionForPeerId ? 'StarGiftUpgradeUniqueTextPrepaid' : 'StarGiftUpgradeUniqueText'}
                    args={props.descriptionForPeerId ? [peerTitle.cloneNode(true)] : []}
                  />
                </div>
              </div>
              <div class="popup-star-gift-upgrade-feature">
                <IconTsx class="popup-star-gift-upgrade-feature-icon" icon="gem_exchange" />
                <div class="popup-star-gift-upgrade-feature-body">
                  <I18nTsx class="popup-star-gift-upgrade-feature-title" key="StarGiftUpgradeTransferableTitle" />
                  <I18nTsx
                    class="popup-star-gift-upgrade-feature-text"
                    key={props.descriptionForPeerId ? 'StarGiftUpgradeTransferableTextPrepaid' : 'StarGiftUpgradeTransferableText'}
                    args={props.descriptionForPeerId ? [peerTitle.cloneNode(true)] : []}
                  />
                </div>
              </div>
              <div class="popup-star-gift-upgrade-feature">
                <IconTsx class="popup-star-gift-upgrade-feature-icon" icon="trade" />
                <div class="popup-star-gift-upgrade-feature-body">
                  <I18nTsx class="popup-star-gift-upgrade-feature-title" key="StarGiftUpgradeTradableTitle" />
                  <I18nTsx
                    class="popup-star-gift-upgrade-feature-text"
                    key={props.descriptionForPeerId ? 'StarGiftUpgradeTradableTextPrepaid' : 'StarGiftUpgradeTradableText'}
                    args={props.descriptionForPeerId ? [peerTitle.cloneNode(true)] : []}
                  />
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
          {props.descriptionForPeerId && !canPrepay ? (
            <PopupElement.FooterButton
              langKey="OK"
              callback={() => setShow(false)}
            />
          ) : (
            <PopupElement.FooterButton callback={handleUpgrade}>
              <I18nTsx
                key={freeUpgrade ? 'StarGiftUpgradeFree' : props.descriptionForPeerId ? 'StarGiftUpgradePrepaid' : 'StarGiftUpgrade'}
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
          {hasFuturePrices() && !canPrepay && (
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
