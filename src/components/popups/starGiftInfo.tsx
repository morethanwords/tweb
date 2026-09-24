import {createMemo, createSignal, Index, JSX, Match, onMount, Show, Switch, untrack, useContext} from 'solid-js';
import PopupElement, {createPopup, PopupContext} from './indexTsx';
import {Peer, PaymentsUniqueStarGiftValueInfo, StarGift, StarGiftAttribute, StarGiftAttributeRarity} from '@layer';
import {MyDocument} from '@appManagers/appDocsManager';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import {StarsStar} from '@components/popups/stars';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import Button from '@components/buttonTsx';
import {formatDate, formatFullSentTime} from '@helpers/date';
import appImManager from '@lib/appImManager';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import {MyStarGift} from '@appManagers/appGiftsManager';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import numberThousandSplitter from '@helpers/number/numberThousandSplitter';
import showSendGiftPopup from '@components/popups/sendGift';
import Table, {TableButton, TableButtonWithTooltip, TablePeer, TableRow} from '@components/table';
import {NULL_PEER_ID, STARS_CURRENCY, TON_CURRENCY} from '@appManagers/constants';
import rootScope from '@lib/rootScope';
import {toastNew} from '@components/toast';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import {StarGiftBackdrop} from '@components/stargifts/stargiftBackdrop';
import MediaHeader from '@components/mediaHeader';
import {ButtonMenuToggleTsx} from '@components/buttonMenuToggleTsx';
import {copyTextToClipboard} from '@helpers/clipboard';
import {showSharingPicker2Popup} from '@components/popups/pickUser';
import {I18nTsx} from '@helpers/solid/i18n';
import buttonKeyDown from '@helpers/solid/buttonKeyDown';
import tsNow from '@helpers/tsNow';
import {useAppState} from '@stores/appState';
import transferStarGift from '@components/popups/transferStarGift';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import showBuyResaleGiftPopup from '@components/popups/buyResaleGift';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import formatDuration from '@helpers/formatDuration';
import showSellStarGiftPopup from '@components/popups/sellStarGift';
import {inputStarGiftEquals} from '@appManagers/utils/gifts/inputStarGiftEquals';
import confirmationPopup from '@components/confirmationPopup';
import {getCollectibleName} from '@appManagers/utils/gifts/getCollectibleName';
import {updateStarGift} from '@appManagers/utils/gifts/updateStarGift';
import wrapMessageEntities from '@lib/richTextProcessor/wrapMessageEntities';
import showStarGiftValuePopup from '@components/popups/starGiftValue';
import Icon from '@components/icon';
import {openStarGiftWear} from '@components/popups/starGiftWear';
import {setQuizHint} from '@components/quizHint';
import createStarGiftUpgradePopup from '@components/popups/starGiftUpgrade';
import classNames from '@helpers/string/classNames';
import {createPaymentPopup} from '@components/popups/payment';
import {StarGiftUpgradePreview} from '@appManagers/appGiftsManager';
import {rgbIntToHex} from '@helpers/color';
import wrapSticker from '@components/wrappers/sticker';
import createMiddleware from '@helpers/solid/createMiddleware';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import LottiePlayer from '@lib/lottie/lottiePlayer';
import {SimpleAnimation} from '@helpers/solid/animations';
import BezierEasing from '@vendor/bezierEasing';
import {AnimatedSuper} from '@components/animatedSuper';
import {ConfettiContainer, ConfettiRef} from '@components/confetti';
import {PreloaderTsx} from '@components/putPreloader';
import {showCreateStarGiftOfferPopup} from '@components/popups/createStarGiftOffer';
import {getCanManagePeerGifts} from '@components/stargifts/canManageGifts';

function AttributeTableButton(props: {rarity: StarGiftAttributeRarity}) {
  if(props.rarity._ !== 'starGiftAttributeRarity') {
    const map: Record<Exclude<StarGiftAttributeRarity['_'], 'starGiftAttributeRarity'>, {langKey: LangPackKey, color: string}> = {
      'starGiftAttributeRarityUncommon': {langKey: 'StarGiftRarityUncommon', color: 'green'},
      'starGiftAttributeRarityRare': {langKey: 'StarGiftRarityRare', color: 'blue'},
      'starGiftAttributeRarityEpic': {langKey: 'StarGiftRarityEpic', color: 'violet'},
      'starGiftAttributeRarityLegendary': {langKey: 'StarGiftRarityLegendary', color: 'gold'}
    };

    return (
      <TableButtonWithTooltip
        class={`rarity rarity-${map[props.rarity._].color} disable-hover`}
      >
        {i18n(map[props.rarity._].langKey)}
      </TableButtonWithTooltip>
    );
  }

  return (
    <TableButtonWithTooltip
      tooltipTextElement={i18n('StarGiftAttributeTooltip', [`${props.rarity.permille / 10}%`])}
      tooltipClass="popup-star-gift-info-tooltip"
    >
      {props.rarity.permille / 10}%
    </TableButtonWithTooltip>
  );
}

export function AttributeValue(props: {name: string, rarity: StarGiftAttributeRarity, onClick?: () => void}) {
  return (
    <div class="popup-star-gift-info-attribute-value">
      {props.onClick ? (
        <span
          class="popup-star-gift-info-attribute-clickable"
          role="button"
          tabindex={0}
          onClick={props.onClick}
          onKeyDown={buttonKeyDown}
        >
          {props.name}
        </span>
      ) : props.name}
      <AttributeTableButton rarity={props.rarity} />
    </div>
  )
}

const attributeValueKeyFrames = (element: Element, removed: boolean) => [
  {opacity: 0, transform: `translateY(${removed ? '-14px' : '14px'}) scaleY(0.5)`},
  {opacity: 1, transform: 'translateY(0)'}
]

const attributeIntervalEasing = BezierEasing(0.5, 0, 1, 1);

function calculateEasedIntervals(count: number, duration: number): number[] {
  const intervals: number[] = [];
  for(let i = 0; i < count; i++) {
    const t0 = i / count;
    const t1 = (i + 1) / count;
    const interval = (attributeIntervalEasing(t1) - attributeIntervalEasing(t0)) * duration;
    intervals.push(interval);
  }
  return intervals;
}

type AnimatedAttributeValueItem = {name: string, rarity: StarGiftAttributeRarity};
function AnimatedAttributeValue(props: {
  items: AnimatedAttributeValueItem[],
  actual: AnimatedAttributeValueItem,
  duration: number,
  count: number,
  onComplete?: () => void,
  onClick?: () => void
  started: boolean
}) {
  const [position, setPosition] = createSignal(0);

  const items: AnimatedAttributeValueItem[] = [];
  while(items.length < props.count - 1) {
    const left = props.count - 1 - items.length;
    items.push(...props.items.slice(0, left));
  }
  items.push(props.actual);

  const intervals = calculateEasedIntervals(items.length, props.duration);

  onMount(() => {
    function scheduleNext(index: number) {
      setTimeout(() => {
        const nextIndex = index + 1;
        setPosition(nextIndex);
        if(nextIndex < items.length - 1) {
          scheduleNext(nextIndex);
        } else {
          props.onComplete?.();
        }
      }, intervals[index]);
    }

    function scheduleRandom() {
      let randomIndex = Math.floor(Math.random() * items.length);
      if(position() === randomIndex) {
        randomIndex = (randomIndex + 1) % items.length;
      }
      setPosition(randomIndex);

      setTimeout(() => {
        if(props.started) {
          scheduleNext(0);
        } else {
          scheduleRandom();
        }
      }, 150);
    }

    if(props.started) {
      scheduleNext(0);
    } else {
      scheduleRandom();
    }
  });

  return (
    <SimpleAnimation
      keyframes={attributeValueKeyFrames}
      mode="replacement"
      appear={true}
    >
      <Switch>
        <Index each={items}>
          {(item, index) => (
            <Match when={index === position()}>
              <AttributeValue
                name={item().name}
                rarity={item().rarity}
                onClick={props.onClick}
              />
            </Match>
          )}
        </Index>
      </Switch>
    </SimpleAnimation>
  )
}

function UpgradeAnimation(props: {
  preview: StarGiftUpgradePreview,
  actualModel: StarGiftAttribute.starGiftAttributeModel,
  actualBackdrop: StarGiftAttribute.starGiftAttributeBackdrop,
  confetti: ConfettiRef,
  onReady: () => void,
  onComplete: () => void
}) {
  const MODELS_COUNT = 20;
  const BACKDROPS_COUNT = 5;
  const MODEL_WIDTH = 120;
  const MODEL_GAP = 100;
  const MODELS_DURATION = 2000;
  const BACKDROPS_DURATION = 700;

  const models: StarGiftAttribute.starGiftAttributeModel[] = [];
  while(models.length < MODELS_COUNT - 1) {
    const left = MODELS_COUNT - 1 - models.length;
    models.push(...props.preview.models.slice(0, left));
  }
  models.push(props.actualModel);

  const backdrops: StarGiftAttribute.starGiftAttributeBackdrop[] = [];
  while(backdrops.length < BACKDROPS_COUNT - 1) {
    const left = BACKDROPS_COUNT - 1 - backdrops.length;
    backdrops.push(...props.preview.backdrops.slice(0, left));
  }
  backdrops.push(props.actualBackdrop);

  const totalSections = backdrops.length + 2;
  const sectionSize = 100 / totalSections;
  const colors = backdrops.map((b) => rgbIntToHex(b.edge_color));
  const lastColor = colors[colors.length - 1];
  const gradientStopsStr = [
    // initial padding
    `${colors[0]} 0%`, `${colors[0]} ${sectionSize}%`,
    ...colors.flatMap((color, i) => {
      const base = (i + 1) * sectionSize;
      // 33% transition in, 34% solid, 33% transition out
      return [`${color} ${base + sectionSize * 0.33}%`, `${color} ${base + sectionSize * 0.67}%`];
    }),
    // final padding
    `${lastColor} ${(totalSections - 1) * sectionSize}%`, `${lastColor} 100%`
  ].join(', ');

  let modelsContainer!: HTMLDivElement;
  let backdropEl!: HTMLDivElement;
  const [loading, setLoading] = createSignal(true);

  onMount(async() => {
    const middleware = createMiddleware();

    let lastPlayer: LottiePlayer;
    await Promise.all(models.map(async(model, idx) => {
      const div = document.createElement('div');
      const isLast = idx === models.length - 1;
      div.classList.add('popup-star-gift-info-upgrade-model');
      if(isLast) {
        div.classList.add('last');
      }
      modelsContainer.appendChild(div);

      return wrapSticker({
        doc: model.document as MyDocument,
        div,
        width: MODEL_WIDTH,
        height: MODEL_WIDTH,
        play: false,
        needFadeIn: false,
        middleware: middleware.get()
      }).then(({render}) => render).then((player) => {
        if(isLast) {
          lastPlayer = player as LottiePlayer;
        }
      });
    }));

    props.onReady();
    setLoading(false);

    const containerWidth = modelsContainer.parentElement!.offsetWidth;
    const totalModelsWidth = MODELS_COUNT * MODEL_WIDTH + (MODELS_COUNT - 1) * MODEL_GAP;
    const startOffset = (containerWidth - MODEL_WIDTH) / 2;
    const endOffset = -(totalModelsWidth - containerWidth + startOffset);
    const containerCenter = containerWidth / 2;
    const modelDivs = Array.from(modelsContainer.children) as HTMLDivElement[];

    const animation = modelsContainer.animate([
      {transform: `translateX(${startOffset}px)`},
      {transform: `translateX(${endOffset}px)`}
    ], {
      duration: MODELS_DURATION,
      easing: 'cubic-bezier(1.00,1.00,0.35,1.00)',
      fill: 'forwards'
    });

    // 3d-ish scrolling animation
    let rafId: number;
    let finishing = false;
    const updateModels = () => {
      const containerRect = modelsContainer.parentElement!.getBoundingClientRect();
      for(const div of modelDivs) {
        const rect = div.getBoundingClientRect();
        const modelCenter = rect.left + rect.width / 2 - containerRect.left;
        const distFromCenter = Math.abs(modelCenter - containerCenter);
        const t = Math.min(distFromCenter / containerCenter, 1);
        const scaleY = 1 - t * 0.2;
        const scaleX = 1 - t * 0.5;
        div.style.transform = `scale(${scaleX}, ${scaleY})`;
        if(!finishing) {
          const opacity = 1 - t * 0.5;
          div.style.opacity = `${opacity}`;
        }
      }
      if(animation.playState === 'running') {
        rafId = requestAnimationFrame(updateModels);
      }
    };
    rafId = requestAnimationFrame(updateModels);
    animation.addEventListener('finish', () => cancelAnimationFrame(rafId));

    setTimeout(() => {
      modelsContainer.classList.add('finishing');
      finishing = true
      lastPlayer.playOrRestart();
      lastPlayer.addEventListener('enterFrame', (frameNo) => {
        if(frameNo === lastPlayer.maxFrame) {
          lastPlayer.stop(false);
          middleware.destroy();
          props.onComplete();
        }
      });
    }, MODELS_DURATION - 500);
    setTimeout(() => {
      props.confetti.create({mode: 'poppers'});
    }, MODELS_DURATION - 750);

    setTimeout(() => backdropEl.animate([
      {backgroundPosition: '0% 0%'},
      {backgroundPosition: '100% 0%'}
    ], {
      duration: BACKDROPS_DURATION,
      easing: 'linear',
      fill: 'forwards'
    }), 50);

    setTimeout(() => {
      backdropEl.classList.add('finishing');
    }, BACKDROPS_DURATION - 200);
  });

  return (
    <>
      <div
        ref={backdropEl}
        class="popup-star-gift-info-upgrade-backdrops"
        style={{
          'background': `linear-gradient(to right, ${gradientStopsStr})`,
          'background-size': `${totalSections * 100}% 100%`
        }}
      />
      <div class="popup-star-gift-info-upgrade-models-container">
        <Show when={loading()}>
          <PreloaderTsx />
        </Show>
        <div ref={modelsContainer} class="popup-star-gift-info-upgrade-models" style={{display: loading() ? 'none' : undefined}} />
      </div>
    </>
  );
}

function AnimatedCollectibleNumber(props: {
  targetNumber: number,
  started: boolean
}) {
  let containerRef!: HTMLSpanElement;

  onMount(() => {
    const targetStr = String(props.targetNumber);
    const digitCount = targetStr.length;

    // ! cant use AnimatedCounter because of the comma separator
    const digitAnimators: {animator: AnimatedSuper, placeholder: HTMLElement}[] = [];
    for(let i = 0; i < digitCount; i++) {
      const posFromRight = digitCount - i;
      if(posFromRight < digitCount && posFromRight % 3 === 0) {
        const comma = document.createElement('div');
        comma.className = 'animated-counter-decimal';
        comma.textContent = ',';
        containerRef.appendChild(comma);
      }

      const item = document.createElement('div');
      item.className = 'animated-counter-decimal';

      const placeholder = document.createElement('div');
      placeholder.className = 'animated-counter-decimal-placeholder';

      const animator = new AnimatedSuper({duration: 100});
      animator.container.className = 'animated-counter-decimal-wrapper';

      item.append(placeholder, animator.container);
      containerRef.appendChild(item);
      digitAnimators.push({animator, placeholder});
    }

    const getRandomDigit = () => Math.floor(Math.random() * 10);

    const setDigits = (lockedFromLeft: number, animate: boolean) => {
      for(let i = 0; i < digitCount; i++) {
        const {animator, placeholder} = digitAnimators[i];
        let newDigit: number;
        if(i < lockedFromLeft) {
          newDigit = parseInt(targetStr[i]);
        } else {
          newDigit = getRandomDigit();
          if(i === 0 && newDigit === 0) newDigit = 1
        }

        const previousDigit = animator.rows[Object.keys(animator.rows)[0]] ?
          parseInt(Object.keys(animator.rows)[0]) : -1;

        const row = animator.getRow(newDigit, animate);
        row.textContent = placeholder.textContent = String(newDigit);

        if(animate && previousDigit !== newDigit) {
          animator.animate(newDigit, previousDigit, newDigit > previousDigit, true);
        } else if(!animate) {
          animator.setNewRow(newDigit);
        }
      }
    };

    setDigits(0, false);

    const totalUpdates = 10;
    const totalDuration = 2000;
    const intervals = calculateEasedIntervals(totalUpdates, totalDuration);

    let updateCount = 0;

    function scheduleNext() {
      setTimeout(() => {
        updateCount++;

        const progress = updateCount / totalUpdates;
        const lockedDigits = Math.min(
          digitCount,
          Math.floor(progress * (digitCount + 1))
        );

        if(updateCount >= totalUpdates) {
          setDigits(digitCount, true);
        } else {
          setDigits(lockedDigits, true);
          scheduleNext();
        }
      }, intervals[updateCount]);
    }

    function scheduleRandom() {
      setTimeout(() => {
        setDigits(0, true)
        if(props.started) {
          scheduleNext();
        } else {
          scheduleRandom()
        }
      }, 150);
    }

    if(props.started) {
      scheduleNext();
    } else {
      scheduleRandom()
    }
  });

  return <span ref={containerRef} class="animated-counter" />;
}

export type StarGiftAttributeForClick = StarGiftAttribute.starGiftAttributeModel |
  StarGiftAttribute.starGiftAttributeBackdrop |
  StarGiftAttribute.starGiftAttributePattern;

export default function showStarGiftInfoPopup(options: {
  gift: MyStarGift,
  onClickAway?: () => void,
  resaleRecipient?: PeerId,
  onAttributeClick?: (attribute: StarGiftAttributeForClick) => void,
  upgradeAnimation?: StarGiftUpgradePreview
}) {
  const myGift = options.gift;
  const {onClickAway, resaleRecipient, onAttributeClick, upgradeAnimation} = options;

  const isResale = myGift.resellPriceStars !== undefined &&
    getPeerId((myGift.raw as StarGift.starGiftUnique).owner_id) !== rootScope.myId;
  const canUpgrade = myGift.raw._ === 'starGift' && myGift.saved?.pFlags.can_upgrade && (
    myGift.ownerId === rootScope.myId ||
    myGift.saved?.prepaid_upgrade_hash !== undefined
  );

  // the popup only opens once its value is known, so the handle has to be able to cancel that
  let cancelled = false;
  const [show, setShow] = createSignal(true);
  const handle = {
    hide: () => {
      cancelled = true;
      setShow(false);
    }
  };

  let containerEl!: HTMLDivElement;

  function Inner(props: {value: PaymentsUniqueStarGiftValueInfo | null, canManageGifts: boolean}) {
    const context = useContext(PopupContext);
    const middleware = untrack(() => context.middlewareHelper).get();
    const {
      saved,
      raw: gift,
      ownerId,
      sticker,
      isIncoming,
      isConverted,
      collectibleAttributes
    } = myGift;

    const isUnavailable = !saved && (gift as StarGift.starGift).availability_remains === 0;
    const fromId = saved ? getPeerId(saved.from_id) : NULL_PEER_ID;
    const date = saved ? new Date(saved.date * 1000) : null;
    const firstSaleDate = (gift as StarGift.starGift).first_sale_date ? (new Date((gift as StarGift.starGift).first_sale_date * 1000)) : null;
    const lastSaleDate = (gift as StarGift.starGift).last_sale_date ? (new Date((gift as StarGift.starGift).last_sale_date * 1000)) : null;
    const starsValue = (gift as StarGift.starGift).stars;

    let input = myGift.input;
    if(!input && gift._ === 'starGiftUnique') {
      input = {_: 'inputSavedStarGiftSlug', slug: gift.slug}
    }
    const ownerPeerId = myGift.ownerId;
    const isEditableUniqueGift = gift._ === 'starGiftUnique' && ownerPeerId !== undefined && props.canManageGifts;
    const canSave = saved && (gift._ === 'starGift' && isIncoming && !isConverted || isEditableUniqueGift)

    const [isListed, setIsListed] = createSignal((gift as StarGift.starGiftUnique).resell_amount !== undefined);
    const [resellOnlyTon, setResellOnlyTon] = createSignal(myGift.resellOnlyTon);
    const [resellPriceTon, setResellPriceTon] = createSignal(myGift.resellPriceTon);
    const [resellPriceStars, setResellPriceStars] = createSignal(myGift.resellPriceStars);
    const [isWearing, setIsWearing] = createSignal(myGift.isWearing);
    const [upgradeAnimationStarted, setUpgradeAnimationStarted] = createSignal(false);
    const [upgradeAnimationComplete, setUpgradeAnimationComplete] = createSignal(!upgradeAnimation);

    subscribeOn(rootScope)('star_gift_update', (event) => {
      if(inputStarGiftEquals(myGift, event.input)) {
        if(event.resalePrice) {
          setIsListed(event.resalePrice.length > 0);
          updateStarGift(myGift, event);
          setResellOnlyTon(myGift.resellOnlyTon);
          setResellPriceTon(myGift.resellPriceTon);
          setResellPriceStars(myGift.resellPriceStars);
        }
        if(event.wearing !== undefined) {
          setIsWearing(event.wearing);
          createSnackbar({
            icon: event.wearing ? 'crown_filled' : 'crownoff_filled',
            textElement: event.wearing ?
              i18n('SetAsEmojiStatusInfo') :
              i18n('StarGiftWearStopped', [getCollectibleName(gift as StarGift.starGiftUnique)])
          });
        }
      }
    })

    subscribeOn(rootScope)('emoji_status_change', async() => {
      const self = await rootScope.managers.appUsersManager.getSelf();
      const wearingGiftId = self?.emoji_status?._ === 'emojiStatusCollectible' ? self.emoji_status.collectible_id : null;
      setIsWearing(wearingGiftId === gift.id);
    })

    const openPeer = (peerId: PeerId) => {
      appImManager.setInnerPeer({peerId})
      onClickAway?.()
      context.hide()
    }

    const handleAttributeClick = (attribute: StarGiftAttribute.starGiftAttributeModel | StarGiftAttribute.starGiftAttributeBackdrop | StarGiftAttribute.starGiftAttributePattern) => {
      if(onAttributeClick) {
        onAttributeClick(attribute);
        return
      }

      showSendGiftPopup({
        peerId: rootScope.myId,
        resaleParams: {
          giftId: (gift as StarGift.starGiftUnique).gift_id,
          filter: attribute
        }
      })
    }

    let loading = false;
    const toggleGiftHidden = () => {
      if(loading) return;
      loading = true;
      context.managers.appGiftsManager.toggleGiftHidden(input, !saved.pFlags.unsaved).then(() => {
        context.hide();
      });
    }

    const handleConfirm = async(): Promise<boolean | void> => {
      if(canUpgrade) {
        await createStarGiftUpgradePopup({
          gift: myGift,
          descriptionForPeerId: myGift.ownerId === rootScope.myId ? undefined : myGift.ownerId
        });
        return;
      }

      if(!isResale) {
        return;
      }

      const recipientId = resaleRecipient ?? rootScope.myId;
      const giftUnique = myGift.raw as StarGift.starGiftUnique;
      showBuyResaleGiftPopup({
        recipientId,
        gift: myGift,
        onFinish: async(bought) => {
          if(!bought) {
            return;
          }

          context.hide();

          const isSelf = recipientId === rootScope.myId;
          if(isSelf) {
            toastNew({
              langPackKey: 'StarGiftResaleBoughtSelf',
              langPackArguments: [`${giftUnique.title} #${numberThousandSplitter(giftUnique.num, ',')}`]
            })
          } else {
            toastNew({
              langPackKey: 'StarGiftResaleBoughtOther',
              langPackArguments: [await wrapPeerTitle({peerId: recipientId, onlyFirstName: true})]
            })
          }
        }
      })

      return false; // the resale flow closes this popup itself once it is paid
    };

    const confirmContent = () => {
      if(isResale) {
        const recipient = resaleRecipient ?? rootScope.myId;
        const nodes: JSX.Element[] = [
          i18n(recipient !== rootScope.myId ? 'StarGiftResaleSend' : 'StarGiftResaleBuy', [
            myGift.resellOnlyTon ?
              paymentsWrapCurrencyAmount(myGift.resellPriceTon, TON_CURRENCY) :
              paymentsWrapCurrencyAmount(myGift.resellPriceStars, STARS_CURRENCY)
          ])
        ];

        if(myGift.resellOnlyTon) {
          const span = i18n('StarGiftResaleStarsAmount', [
            paymentsWrapCurrencyAmount(myGift.resellPriceStars, STARS_CURRENCY)
          ]);
          span.classList.add('popup-star-gift-info-resale-stars-amount');
          nodes.push(span);
        }

        return nodes;
      }

      if(canUpgrade) {
        return [
          i18n(myGift.saved?.prepaid_upgrade_hash ? 'StarGiftGiftUpgrade' : 'StarGiftStatusUpgrade'),
          Icon('arrow_up_circle_filled')
        ];
      }

      return i18n('OK');
    };

    const tableContent = createMemo(() => {
      const rows: TableRow[] = [];

      if(gift._ === 'starGiftUnique') {
        if(gift.owner_id) {
          rows.push([
            'StarGiftOwner',
            <TablePeer
              peerId={getPeerId(gift.owner_id)}
              onClick={() => openPeer(getPeerId(gift.owner_id))}
            />
          ]);
        } else if(gift.owner_name) {
          rows.push([
            'StarGiftOwner',
            gift.owner_name
          ]);
        }

        rows.push([
          'StarGiftModel',
          upgradeAnimation ? (
            <AnimatedAttributeValue
              items={upgradeAnimation.models}
              actual={collectibleAttributes.model}
              duration={2000}
              count={10}
              onClick={() => handleAttributeClick(collectibleAttributes.model)}
              started={upgradeAnimationStarted()}
            />
          ) : (
            <AttributeValue
              name={collectibleAttributes.model.name}
              rarity={collectibleAttributes.model.rarity}
              onClick={() => handleAttributeClick(collectibleAttributes.model)}
            />
          )
        ]);

        rows.push([
          'StarGiftBackdrop',
          upgradeAnimation ? (
            <AnimatedAttributeValue
              items={upgradeAnimation.backdrops}
              actual={collectibleAttributes.backdrop}
              duration={800}
              count={4}
              onClick={() => handleAttributeClick(collectibleAttributes.backdrop)}
              started={upgradeAnimationStarted()}
            />
          ) : (
            <AttributeValue
              name={collectibleAttributes.backdrop.name}
              rarity={collectibleAttributes.backdrop.rarity}
              onClick={() => handleAttributeClick(collectibleAttributes.backdrop)}
            />
          )
        ]);

        rows.push([
          'StarGiftPattern',
          upgradeAnimation ? (
            <AnimatedAttributeValue
              items={upgradeAnimation.patterns}
              actual={collectibleAttributes.pattern}
              duration={1000}
              count={5}
              onClick={() => handleAttributeClick(collectibleAttributes.pattern)}
              started={upgradeAnimationStarted()}
            />
          ) : (
            <AttributeValue
              name={collectibleAttributes.pattern.name}
              rarity={collectibleAttributes.pattern.rarity}
              onClick={() => handleAttributeClick(collectibleAttributes.pattern)}
            />
          )
        ]);

        rows.push([
          'StarGiftAvailability',
          i18n('StarGiftAvailabilityIssued', [
            numberThousandSplitter(gift.availability_issued),
            numberThousandSplitter(gift.availability_total)
          ])
        ]);

        if(props.value) {
          rows.push([
            'StarGiftValue',
            <>
              ~{paymentsWrapCurrencyAmount(props.value.value, props.value.currency)}
              <TableButton
                text="StarGiftValueLearnMore"
                onClick={() => {
                  showStarGiftValuePopup({gift: myGift, value: props.value});
                }}
              />
            </>
          ]);
        }

        return rows;
      }

      if(fromId !== NULL_PEER_ID) {
        rows.push([
          'StarGiftFromShort',
          <>
            <TablePeer
              peerId={fromId}
              onClick={() => openPeer(fromId)}
            />
            <TableButton
              text="StarGiftSendInline"
              onClick={() => {
                context.hide();
                showSendGiftPopup({peerId: fromId});
              }}
            />
          </>
        ]);
      }

      if(date) {
        rows.push([
          'StarGiftDate',
          <span>{formatFullSentTime(date.getTime() / 1000 | 0)}</span>
        ]);
      }

      if(isUnavailable) {
        if(firstSaleDate) {
          rows.push([
            'StarGiftUnavailableFirstSale',
            <span>{formatFullSentTime(firstSaleDate.getTime() / 1000 | 0)}</span>
          ]);
        }

        if(lastSaleDate) {
          rows.push([
            'StarGiftUnavailableLastSale',
            <span>{formatFullSentTime(lastSaleDate.getTime() / 1000 | 0)}</span>
          ]);
        }
      }

      const canConvert = saved?.convert_stars &&
        isIncoming &&
        !isConverted &&
        (tsNow(true) - (date.getTime() / 1000 | 0)) < useAppState()[0].appConfig.stargifts_convert_period_max;
      rows.push([
        'StarGiftValue',
        <>
          <StarsStar />
          {starsValue}
          {canConvert && (
            <TableButton
              text="StarGiftConvertButton"
              textArgs={[saved.convert_stars]}
              onClick={() => {
                rootScope.managers.appGiftsManager.convertGift(input)
                .then(() => {
                  context.hide()
                }).catch(() => {
                  toastNew({langPackKey: 'Error.AnError'})
                })
              }}
            />
          )}
        </>
      ]);

      if(gift.availability_total > 0) {
        rows.push([
          'StarGiftAvailability',
          i18n('StarGiftAvailabilityValue2', [
            numberThousandSplitter((gift as StarGift.starGift).availability_remains ?? 0),
            numberThousandSplitter(gift.availability_total)
          ])
        ]);
      }

      if(gift._ === 'starGift' && saved?.pFlags.can_upgrade) {
        rows.push([
          'StarGiftStatus',
          i18n('StarGiftStatusNonUnique')
        ]);
      }

      return rows;
    })

    const [originalDetails, setOriginalDetails] = createSignal(collectibleAttributes?.original);

    const tableFooter = () => {
      if(originalDetails()) {
        const wrapPeer = (peer: Peer) => {
          const peerId = getPeerId(peer);
          return (
            <PeerTitleTsx
              peerId={peerId}
              onlyFirstName
              onClick={() => openPeer(peerId)}
            />
          );
        };

        let key: LangPackKey;
        const args: JSX.Element[] = [];

        if(collectibleAttributes.original.sender_id) {
          key = collectibleAttributes.original.message ? 'StarGiftOriginalDetailsSenderComment' : 'StarGiftOriginalDetailsSender';
          args.push(wrapPeer(collectibleAttributes.original.sender_id));
        } else {
          key = collectibleAttributes.original.message ? 'StarGiftOriginalDetailsComment' : 'StarGiftOriginalDetailsBasic';
        }

        args.push(wrapPeer(collectibleAttributes.original.recipient_id));
        args.push(formatDate(new Date(collectibleAttributes.original.date * 1000)));

        if(collectibleAttributes.original.message) {
          const span = document.createElement('span');
          const wrapped = wrapMessageEntities(collectibleAttributes.original.message.text, collectibleAttributes.original.message.entities)
          span.append(wrapRichText(wrapped.message, {entities: wrapped.totalEntities}));
          args.push(span);
        }

        return (
          <div class={classNames('popup-star-gift-info-original', saved?.drop_original_details_stars && 'has-delete')}>
            <I18nTsx key={key} args={args} />
            {saved?.drop_original_details_stars && (
              <ButtonIconTsx
                icon="delete"
                aria-label={I18n.format('Delete', true)}
                onClick={async() => {
                  const popup = await createPaymentPopup({
                    inputInvoice: {
                      _: 'inputInvoiceStarGiftDropOriginalDetails',
                      stargift: input
                    }
                  });

                  popup.addEventListener('finish', (result) => {
                    if(result === 'paid') {
                      setOriginalDetails(undefined);
                      delete collectibleAttributes.original
                    }
                  });
                }}
              />
            )}
          </div>
        )
      }

      if(saved?.message) {
        return wrapRichText(saved.message.text, {entities: saved.message.entities});
      }
    }

    const handleShare = () => {
      showSharingPicker2Popup().then(({peerId, threadId, monoforumThreadId}) => {
        rootScope.managers.appMessagesManager.sendText({peerId, threadId, replyToMonoforumPeerId: monoforumThreadId, text: 'https://t.me/nft/' + (gift as StarGift.starGiftUnique).slug});
        appImManager.setInnerPeer({peerId, threadId, monoforumThreadId});
        context.hide();
      });
    }

    const handleSell = async(changePrice = false) => {
      if(!isEditableUniqueGift || !saved) return;

      if(isListed() && !changePrice) {
        await confirmationPopup({
          titleLangKey: 'StarGiftUnlistTitle',
          titleLangArgs: [getCollectibleName(gift as StarGift.starGiftUnique)],
          descriptionLangKey: 'StarGiftUnlistText',
          button: {
            langKey: 'StarGiftUnlistConfirm'
          }
        });
        await context.managers.appGiftsManager.updateResalePrice(input, null);
        createSnackbar({
          icon: 'tag_alt_crossed_filled',
          textElement: i18n('StarGiftResaleRemoved', [getCollectibleName(gift as StarGift.starGiftUnique)])
        })
        return
      }

      const now = tsNow(true);
      if(saved.can_resell_at !== undefined && saved.can_resell_at > now) {
        toastNew({
          langPackKey: 'StarGiftResaleCooldown',
          langPackArguments: [wrapFormattedDuration(formatDuration(saved.can_resell_at - now, 2))]
        });
        return
      }

      showSellStarGiftPopup({
        gift: myGift,
        allowUnlist: changePrice,
        onFinish: (result) => {
          if(result !== 'cancel') {
            createSnackbar({
              icon: result === 'list' ? 'tag_alt_filled' : 'tag_alt_crossed_filled',
              textElement: i18n(
                result === 'list' ? 'StarGiftResaleListed' : 'StarGiftResaleRemoved',
                [getCollectibleName(gift as StarGift.starGiftUnique)]
              )
            })
          }
        }
      })
    }

    const createSnackbar = (params: Omit<Parameters<typeof setQuizHint>[0], 'appendTo' | 'from'>) => {
      return setQuizHint({
        class: 'popup-star-gift-info-snackbar',
        appendTo: containerEl,
        from: 'bottom',
        duration: 5000,
        ...params
      });
    }

    let stickerContainer!: HTMLDivElement;
    onMount(() => {
      if(isEditableUniqueGift) {
        // ! preload options for resale floor price
        context.managers.appGiftsManager.getStarGiftOptions().catch(() => {})
      }

      wrapSticker({
        doc: sticker,
        div: stickerContainer,
        width: 120,
        height: 120,
        play: !upgradeAnimation,
        needFadeIn: !!upgradeAnimation,
        middleware: middleware
      })
    })

    let confetti!: ConfettiRef;

    const content = (
      <div class={`popup-star-gift-info-container ${gift._ === 'starGiftUnique' ? 'is-collectible' : ''}`}>
        <ConfettiContainer ref={confetti} />
        <MediaHeader
          class="popup-star-gift-info-header"
          onBackdrop={gift._ === 'starGiftUnique'}
        >
          {gift._ === 'starGiftUnique' && (
            <MediaHeader.Backdrop>
              <StarGiftBackdrop
                backdrop={collectibleAttributes.backdrop}
                patternEmoji={collectibleAttributes.pattern.document as MyDocument}
              />
            </MediaHeader.Backdrop>
          )}
          <MediaHeader.Sticker
            size={120}
            class={!upgradeAnimationComplete() ? 'hide' : undefined}
            ref={stickerContainer}
          />
          {upgradeAnimation && !upgradeAnimationComplete() && (
            <UpgradeAnimation
              preview={upgradeAnimation}
              actualModel={collectibleAttributes.model}
              actualBackdrop={collectibleAttributes.backdrop}
              onReady={() => setUpgradeAnimationStarted(true)}
              onComplete={() => setUpgradeAnimationComplete(true)}
              confetti={confetti}
            />
          )}
          {isListed() && (
            <button class="popup-star-gift-info-change-price" onClick={() => handleSell(true)}>
              {resellOnlyTon() ?
                paymentsWrapCurrencyAmount(resellPriceTon(), TON_CURRENCY) :
                paymentsWrapCurrencyAmount(resellPriceStars(), STARS_CURRENCY)}
            </button>
          )}
          <ButtonIconTsx
            class="popup-star-gift-info-close"
            icon="close"
            aria-label={I18n.format('Close', true)}
            onClick={() => context.hide()}
          />
          <ButtonMenuToggleTsx
            class="popup-star-gift-info-menu-toggle"
            icon="more"
            buttonOptions={{ariaLabel: 'MultiAccount.More'}}
            direction="bottom-left"
            buttons={[
              {
                icon: saved?.pFlags.pinned_to_top ? 'unpin' : 'pin',
                text: saved?.pFlags.pinned_to_top ? 'StarGiftUnpin' : 'StarGiftPin',
                verify: () => isEditableUniqueGift,
                onClick: () => {
                  if(ownerPeerId === undefined) return;
                  context.managers.appGiftsManager.togglePinnedGift(input, ownerPeerId).then(() => {
                    context.hide();
                  });
                }
              },
              {
                icon: 'tag_alt',
                text: 'StarGiftChangePrice',
                verify: () => isEditableUniqueGift && isListed(),
                onClick: () => handleSell(true)
              },
              {
                icon: 'tag_alt',
                text: 'StarGiftOffer.CreateOffer',
                verify: () => gift._ === 'starGiftUnique' && gift.offer_min_stars !== undefined,
                onClick: () => showCreateStarGiftOfferPopup({
                  gift: myGift,
                  onFinish: (res) => res === 'created' && context.hide()
                })
              },
              {
                icon: 'forward',
                text: 'ShareFile',
                onClick: handleShare
              },
              {
                icon: 'link',
                text: 'CopyLink',
                onClick: () => {
                  copyTextToClipboard('https://t.me/nft/' + (gift as StarGift.starGiftUnique).slug);
                  toastNew({langPackKey: 'LinkCopied'});
                }
              }
            ]}
          />

          <MediaHeader.Title>
            {gift._ === 'starGift' ?
              i18n(isUnavailable ? 'StarGiftUnavailableTitle' : isIncoming ? 'StarGiftReceivedTitle' : 'StarGiftTitle') :
              gift.title
            }
          </MediaHeader.Title>

          <Show when={gift._ ==='starGift'}>
            {isUnavailable ? (
              <MediaHeader.Subtitle color="danger">
                {i18n('StarGiftUnavailableSubtitle')}
              </MediaHeader.Subtitle>
            ) : (
              <div class="popup-star-gift-info-price">
                <StarsStar />
                {starsValue}
              </div>
            )}
            {isIncoming && !isConverted && (
              <MediaHeader.Subtitle>
                {i18n('StarGiftReceivedSubtitle', [saved.convert_stars])}
                {' '}
                <a href="https://telegram.org/blog/telegram-stars" target="_blank">
                  {i18n('StarGiftReceivedSubtitleLink')}
                </a>
              </MediaHeader.Subtitle>
            )}
          </Show>

          {gift._ === 'starGiftUnique' && (
            <MediaHeader.Subtitle class="popup-star-gift-info-collectible-number">
              {
                gift.released_by ?
                  <I18nTsx
                    key="StarGiftCollectibleNumWithAuthor"
                    args={[
                      upgradeAnimation ? (
                        <AnimatedCollectibleNumber targetNumber={gift.num} started={upgradeAnimationStarted()} />
                      ) : numberThousandSplitter(gift.num, ','),
                      <PeerTitleTsx
                        peerId={getPeerId(gift.released_by)}
                        username
                        onClick={() => openPeer(getPeerId(gift.released_by))}
                      />
                    ]}
                  /> :
                  <I18nTsx
                    key="StarGiftCollectibleNum"
                    args={[
                      upgradeAnimation ? (
                        <AnimatedCollectibleNumber targetNumber={gift.num} started={upgradeAnimationStarted()} />
                      ) : numberThousandSplitter(gift.num, ',')
                    ]}
                  />
              }
            </MediaHeader.Subtitle>
          )}

          {isEditableUniqueGift && (
            <div class="popup-star-gift-info-actions">
              <Button
                noRipple
                class="popup-star-gift-info-action"
                icon="gem_transfer_filled"
                text="StarGiftTransfer"
                onClick={() => transferStarGift(myGift).then((ok) => {
                  if(ok) {
                    context.hide();
                  }
                })}
              />
              <Button
                noRipple
                class="popup-star-gift-info-action"
                icon={isWearing() ? 'crownoff_filled' : 'crown_filled'}
                text={isWearing() ? 'StarGiftWearStop' : 'StarGiftWear'}
                onClick={async() => {
                  if(ownerPeerId === undefined) return;
                  if(isWearing()) {
                    if(ownerPeerId === rootScope.myId) {
                      rootScope.managers.appUsersManager.updateEmojiStatus({_: 'emojiStatusEmpty'});
                    } else {
                      rootScope.managers.apiManager.invokeApiSingleProcess({
                        method: 'channels.updateEmojiStatus',
                        params: {
                          channel: await rootScope.managers.appChatsManager.getChannelInput(ownerPeerId.toChatId()),
                          emoji_status: {_: 'emojiStatusEmpty'}
                        }
                      }).then((updates) => {
                        rootScope.managers.apiUpdatesManager.processUpdateMessage(updates);
                      }).catch(() => {
                        toastNew({langPackKey: 'Error.AnError'});
                      });
                    }
                  } else {
                    openStarGiftWear(myGift, ownerPeerId)
                  }
                }}
              />
              <Button
                noRipple
                class="popup-star-gift-info-action"
                icon={isListed() ? 'tag_alt_crossed_filled' : 'tag_alt_filled'}
                text={isListed() ? 'StarGiftUnlistButton' : 'StarGiftSell'}
                onClick={() => handleSell()}
              />
            </div>
          )}
        </MediaHeader>

        <div class="popup-star-gift-info-table">
          <Table
            content={tableContent()}
            footer={tableFooter()}
            cellClass="popup-star-gift-info-table-cell"
            footerClass={gift._ === 'starGiftUnique' ? 'popup-star-gift-info-footer-unique' : undefined}
          />
        </div>

        {canSave && (
          <div class="popup-star-gift-info-hint">
            {saved.pFlags.unsaved ? i18n('StarGiftHiddenHint') : i18n('StarGiftVisibleHint')}
            {' '}
            <a href="#" onClick={toggleGiftHidden}>
              {i18n(saved.pFlags.unsaved ? 'StarGiftVisibleShowLink' : 'StarGiftVisibleHideLink')}
            </a>
          </div>
        )}

        {saved?.pFlags.name_hidden && (
          <div class="popup-star-gift-info-hint">
            {i18n('StarGiftHiddenSender')}
          </div>
        )}
      </div>
    );

    return (
      <>
        <PopupElement.Body>{content}</PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            confirm
            class={classNames(
              isResale && 'popup-star-gift-info-resale-button',
              isResale && myGift.resellOnlyTon && 'popup-star-gift-info-resale-button-twoline'
            )}
            callback={handleConfirm}
          >
            {confirmContent()}
          </PopupElement.FooterButton>
        </PopupElement.Footer>
      </>
    );
  }

  (async() => {
    const raw = myGift.raw;
    const [value, canManageGifts] = await Promise.all([
      raw._ === 'starGiftUnique' ? rootScope.managers.appGiftsManager.getGiftValue(raw.slug) : Promise.resolve(null),
      myGift.ownerId !== undefined ? getCanManagePeerGifts(myGift.ownerId) : Promise.resolve(false)
    ]);
    if(cancelled) {
      return;
    }

    createPopup(() => (
      <PopupElement
        class="popup-star-gift-info"
        closable
        show={show()}
        containerProps={{ref: (element) => containerEl = element}}
        old
      >
        <Inner value={value} canManageGifts={canManageGifts} />
      </PopupElement>
    ));
  })();

  return handle;
}
