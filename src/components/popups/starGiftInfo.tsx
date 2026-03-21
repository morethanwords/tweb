import {createMemo, createSignal, Index, JSX, Match, onMount, Show, Switch} from 'solid-js';
import PopupElement from '.';
import {Peer, PaymentsUniqueStarGiftValueInfo, StarGift, StarGiftAttribute, StarGiftAttributeRarity} from '@layer';
import {MyDocument} from '@appManagers/appDocsManager';
import {i18n, LangPackKey} from '@lib/langPack';
import {StarsStar} from '@components/popups/stars';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import Button from '@components/buttonTsx';
import {formatDate, formatFullSentTime} from '@helpers/date';
import appImManager from '@lib/appImManager';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import {MyStarGift} from '@appManagers/appGiftsManager';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import numberThousandSplitter from '@helpers/number/numberThousandSplitter';
import PopupSendGift from '@components/popups/sendGift';
import Table, {TableButton, TableButtonWithTooltip, TablePeer, TableRow} from '@components/table';
import {NULL_PEER_ID, STARS_CURRENCY, TON_CURRENCY} from '@appManagers/constants';
import rootScope from '@lib/rootScope';
import {toastNew} from '@components/toast';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import {StarGiftBackdrop} from '@components/stargifts/stargiftBackdrop';
import {ButtonMenuToggleTsx} from '@components/buttonMenuToggleTsx';
import {copyTextToClipboard} from '@helpers/clipboard';
import PopupPickUser from '@components/popups/pickUser';
import {I18nTsx} from '@helpers/solid/i18n';
import tsNow from '@helpers/tsNow';
import {useAppState} from '@stores/appState';
import transferStarGift from '@components/popups/transferStarGift';
import safeAssign from '@helpers/object/safeAssign';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import PopupBuyResaleGift from '@components/popups/buyResaleGift';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import formatDuration from '@helpers/formatDuration';
import PopupSellStarGift from '@components/popups/sellStarGift';
import {inputStarGiftEquals} from '@appManagers/utils/gifts/inputStarGiftEquals';
import confirmationPopup from '@components/confirmationPopup';
import {getCollectibleName} from '@appManagers/utils/gifts/getCollectibleName';
import {updateStarGift} from '@appManagers/utils/gifts/updateStarGift';
import wrapMessageEntities from '@lib/richTextProcessor/wrapMessageEntities';
import PopupStarGiftValue from '@components/popups/starGiftValue';
import Icon from '@components/icon';
import PopupStarGiftWear from '@components/popups/starGiftWear';
import {setQuizHint} from '@components/poll';
import createStarGiftUpgradePopup from '@components/popups/starGiftUpgrade';
import classNames from '@helpers/string/classNames';
import PopupPayment from '@components/popups/payment';
import {StarGiftUpgradePreview} from '@appManagers/appGiftsManager';
import {rgbIntToHex} from '@helpers/color';
import wrapSticker from '@components/wrappers/sticker';
import createMiddleware from '@helpers/solid/createMiddleware';
import RLottiePlayer from '@lib/rlottie/rlottiePlayer';
import {SimpleAnimation} from '@helpers/solid/animations';
import BezierEasing from '@vendor/bezierEasing';
import {AnimatedSuper} from '@components/animatedSuper';
import {ConfettiContainer, ConfettiRef} from '@components/confetti';
import {PreloaderTsx} from '@components/putPreloader';
import {showCreateStarGiftOfferPopup} from '@components/popups/createStarGiftOffer';

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
        <span class="popup-star-gift-info-attribute-clickable" onClick={props.onClick}>
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
  const gradientStopsStr = [
    // initial padding
    `${colors[0]} 0%`, `${colors[0]} ${sectionSize}%`,
    ...colors.flatMap((color, i) => {
      const base = (i + 1) * sectionSize;
      // 33% transition in, 34% solid, 33% transition out
      return [`${color} ${base + sectionSize * 0.33}%`, `${color} ${base + sectionSize * 0.67}%`];
    }),
    // final padding
    `${colors[colors.length - 1]} ${(totalSections - 1) * sectionSize}%`, `${colors[colors.length - 1]} 100%`
  ].join(', ');

  let modelsContainer!: HTMLDivElement;
  let backdropEl!: HTMLDivElement;
  const [loading, setLoading] = createSignal(true);

  onMount(async() => {
    const middleware = createMiddleware();

    let lastPlayer: RLottiePlayer;
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
          lastPlayer = player as RLottiePlayer;
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

export default class PopupStarGiftInfo extends PopupElement {
  private gift: MyStarGift;
  private resaleRecipient?: PeerId;
  private onClickAway?: () => void;
  private onAttributeClick?: (attribute: StarGiftAttribute.starGiftAttributeModel | StarGiftAttribute.starGiftAttributeBackdrop | StarGiftAttribute.starGiftAttributePattern) => void;
  private upgradeAnimation?: StarGiftUpgradePreview;

  private isResale: boolean
  private canUpgrade: boolean

  constructor(options: {
    gift: MyStarGift,
    onClickAway?: () => void,
    resaleRecipient?: PeerId,
    onAttributeClick?: (attribute: StarGiftAttribute.starGiftAttributeModel | StarGiftAttribute.starGiftAttributeBackdrop | StarGiftAttribute.starGiftAttributePattern) => void,
    upgradeAnimation?: StarGiftUpgradePreview
  }) {
    super('popup-star-gift-info', {
      closable: true,
      overlayClosable: true,
      body: true,
      footer: true,
      withConfirm: 'OK',
      withFooterConfirm: true
    });

    safeAssign(this, options);
    this.isResale = this.gift.resellPriceStars !== undefined && getPeerId((this.gift.raw as StarGift.starGiftUnique).owner_id) !== rootScope.myId;
    this.canUpgrade = this.gift.raw._ === 'starGift' && this.gift.saved?.pFlags.can_upgrade && (
      this.gift.ownerId === rootScope.myId ||
      this.gift.saved?.prepaid_upgrade_hash !== undefined
    );

    this.construct();
  }

  private _construct({value}: { value: PaymentsUniqueStarGiftValueInfo }) {
    const {
      saved,
      raw: gift,
      ownerId,
      sticker,
      isIncoming,
      isConverted,
      collectibleAttributes
    } = this.gift;

    const isUnavailable = !saved && (gift as StarGift.starGift).availability_remains === 0;
    const fromId = saved ? getPeerId(saved.from_id) : NULL_PEER_ID;
    const date = saved ? new Date(saved.date * 1000) : null;
    const firstSaleDate = (gift as StarGift.starGift).first_sale_date ? (new Date((gift as StarGift.starGift).first_sale_date * 1000)) : null;
    const lastSaleDate = (gift as StarGift.starGift).last_sale_date ? (new Date((gift as StarGift.starGift).last_sale_date * 1000)) : null;
    const starsValue = (gift as StarGift.starGift).stars;

    const isOwnedUniqueGift = gift._ === 'starGiftUnique' && getPeerId(gift.owner_id) === rootScope.myId
    const canSave = gift._ === 'starGift' && isIncoming && !isConverted || (isOwnedUniqueGift && saved !== undefined)
    let input = this.gift.input;
    if(!input && gift._ === 'starGiftUnique') {
      input = {_: 'inputSavedStarGiftSlug', slug: gift.slug}
    }

    const [isListed, setIsListed] = createSignal((gift as StarGift.starGiftUnique).resell_amount !== undefined);
    const [resellOnlyTon, setResellOnlyTon] = createSignal(this.gift.resellOnlyTon);
    const [resellPriceTon, setResellPriceTon] = createSignal(this.gift.resellPriceTon);
    const [resellPriceStars, setResellPriceStars] = createSignal(this.gift.resellPriceStars);
    const [isWearing, setIsWearing] = createSignal(this.gift.isWearing);
    const [upgradeAnimationStarted, setUpgradeAnimationStarted] = createSignal(false);
    const [upgradeAnimationComplete, setUpgradeAnimationComplete] = createSignal(!this.upgradeAnimation);

    this.listenerSetter.add(rootScope)('star_gift_update', (event) => {
      if(inputStarGiftEquals(this.gift, event.input)) {
        if(event.resalePrice) {
          setIsListed(event.resalePrice.length > 0);
          updateStarGift(this.gift, event);
          setResellOnlyTon(this.gift.resellOnlyTon);
          setResellPriceTon(this.gift.resellPriceTon);
          setResellPriceStars(this.gift.resellPriceStars);
        }
        if(event.wearing !== undefined) {
          setIsWearing(event.wearing);
          createSnackbar({
            icon: event.wearing ? 'crown' : 'crownoff',
            textElement: event.wearing ?
              i18n('SetAsEmojiStatusInfo') :
              i18n('StarGiftWearStopped', [getCollectibleName(gift as StarGift.starGiftUnique)])
          });
        }
      }
    })

    this.listenerSetter.add(rootScope)('emoji_status_change', async() => {
      const self = await rootScope.managers.appUsersManager.getSelf();
      const wearingGiftId = self?.emoji_status?._ === 'emojiStatusCollectible' ? self.emoji_status.collectible_id : null;
      setIsWearing(wearingGiftId === gift.id);
    })

    const handleAttributeClick = (attribute: StarGiftAttribute.starGiftAttributeModel | StarGiftAttribute.starGiftAttributeBackdrop | StarGiftAttribute.starGiftAttributePattern) => {
      if(this.onAttributeClick) {
        this.onAttributeClick(attribute);
        return
      }

      PopupElement.createPopup(PopupSendGift, {
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
      this.managers.appGiftsManager.toggleGiftHidden(input, !saved.pFlags.unsaved).then(() => {
        this.hide();
      });
    }

    if(this.canUpgrade) {
      attachClickEvent(this.btnConfirm, () => createStarGiftUpgradePopup({
        gift: this.gift,
        descriptionForPeerId: this.gift.ownerId === rootScope.myId ? undefined : this.gift.ownerId
      }).then(() => this.hide()));
    } else if(this.isResale) {
      attachClickEvent(this.btnConfirm, () => {
        const recipientId = this.resaleRecipient ?? rootScope.myId;
        const popup = PopupElement.createPopup(PopupBuyResaleGift, {
          recipientId,
          gift: this.gift
        })
        const giftUnique = this.gift.raw as StarGift.starGiftUnique;
        popup.show()
        popup.addEventListener('finish', async(bought) => {
          if(bought) {
            this.hide();

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
      });
    } else {
      attachClickEvent(this.btnConfirm, () => this.hide());
    }

    const tableContent = createMemo(() => {
      const rows: TableRow[] = [];

      if(gift._ === 'starGiftUnique') {
        if(gift.owner_id) {
          rows.push([
            'StarGiftOwner',
            <TablePeer
              peerId={getPeerId(gift.owner_id)}
              onClick={() => {
                appImManager.setInnerPeer({peerId: getPeerId(gift.owner_id)})
                this.onClickAway?.()
                this.hide()
              }}
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
          this.upgradeAnimation ? (
            <AnimatedAttributeValue
              items={this.upgradeAnimation.models}
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
          this.upgradeAnimation ? (
            <AnimatedAttributeValue
              items={this.upgradeAnimation.backdrops}
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
          this.upgradeAnimation ? (
            <AnimatedAttributeValue
              items={this.upgradeAnimation.patterns}
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

        if(value) {
          rows.push([
            'StarGiftValue',
            <>
              ~{paymentsWrapCurrencyAmount(value.value, value.currency)}
              <TableButton
                text="StarGiftValueLearnMore"
                onClick={() => {
                  PopupElement.createPopup(PopupStarGiftValue, {gift: this.gift, value}).show();
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
            <TablePeer peerId={fromId} />
            <TableButton
              text="StarGiftSendInline"
              onClick={() => {
                this.hide();
                PopupElement.createPopup(PopupSendGift, {peerId: fromId});
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
                  this.hide()
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
              onClick={() => {
                appImManager.setInnerPeer({peerId})
                this.hide()
              }}
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
                onClick={async() => {
                  const popup = await PopupPayment.create({
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
      PopupPickUser.createSharingPicker2().then(({peerId, threadId, monoforumThreadId}) => {
        rootScope.managers.appMessagesManager.sendText({peerId, threadId, replyToMonoforumPeerId: monoforumThreadId, text: 'https://t.me/nft/' + (gift as StarGift.starGiftUnique).slug});
        appImManager.setInnerPeer({peerId, threadId, monoforumThreadId});
        this.hide();
      });
    }

    const handleSell = async(changePrice = false) => {
      if(!isOwnedUniqueGift || !saved) return;

      if(isListed() && !changePrice) {
        await confirmationPopup({
          titleLangKey: 'StarGiftUnlistTitle',
          titleLangArgs: [getCollectibleName(gift as StarGift.starGiftUnique)],
          descriptionLangKey: 'StarGiftUnlistText',
          button: {
            langKey: 'StarGiftUnlistConfirm'
          }
        });
        await this.managers.appGiftsManager.updateResalePrice(input, null);
        createSnackbar({
          icon: 'tag_alt_crossed',
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

      const popup = PopupElement.createPopup(PopupSellStarGift, {gift: this.gift, allowUnlist: changePrice})
      popup.addEventListener('finish', (result) => {
        if(result !== 'cancel') {
          createSnackbar({
            icon: result === 'list' ? 'tag_alt' : 'tag_alt_crossed',
            textElement: i18n(
              result === 'list' ? 'StarGiftResaleListed' : 'StarGiftResaleRemoved',
              [getCollectibleName(gift as StarGift.starGiftUnique)]
            )
          })
        }
      })
    }

    const createSnackbar = (params: Omit<Parameters<typeof setQuizHint>[0], 'appendTo' | 'from'>) => {
      return setQuizHint({
        class: 'popup-star-gift-info-snackbar',
        appendTo: this.container,
        from: 'bottom',
        duration: 5000,
        ...params
      });
    }

    let stickerContainer!: HTMLDivElement;
    onMount(() => {
      if(isOwnedUniqueGift) {
        // ! preload options for resale floor price
        this.managers.appGiftsManager.getStarGiftOptions().catch(() => {})
      }

      wrapSticker({
        doc: sticker,
        div: stickerContainer,
        width: 120,
        height: 120,
        play: !this.upgradeAnimation,
        needFadeIn: !!this.upgradeAnimation,
        middleware: this.middlewareHelper.get()
      })
    })

    let confetti!: ConfettiRef;

    return (
      <div class={`popup-star-gift-info-container ${gift._ === 'starGiftUnique' ? 'is-collectible' : ''}`}>
        <ConfettiContainer ref={confetti} />
        <div class="popup-star-gift-info-header">
          {gift._ === 'starGiftUnique' && (
            <StarGiftBackdrop
              class="popup-star-gift-info-backdrop"
              backdrop={collectibleAttributes.backdrop}
              patternEmoji={collectibleAttributes.pattern.document as MyDocument}
            />
          )}
          <div
            class="popup-star-gift-info-sticker"
            classList={{hide: !upgradeAnimationComplete()}}
            ref={stickerContainer}
          />
          {this.upgradeAnimation && !upgradeAnimationComplete() && (
            <UpgradeAnimation
              preview={this.upgradeAnimation}
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
            onClick={() => this.hide()}
          />
          <ButtonMenuToggleTsx
            class="popup-star-gift-info-menu-toggle"
            icon="more"
            direction="bottom-left"
            buttons={[
              {
                icon: saved?.pFlags.pinned_to_top ? 'unpin' : 'pin',
                text: saved?.pFlags.pinned_to_top ? 'StarGiftUnpin' : 'StarGiftPin',
                verify: () => isOwnedUniqueGift,
                onClick: () => {
                  this.managers.appGiftsManager.togglePinnedGift(input).then(() => {
                    this.hide();
                  });
                }
              },
              {
                icon: 'tag_alt_outline',
                text: 'StarGiftChangePrice',
                verify: () => isOwnedUniqueGift && isListed(),
                onClick: () => handleSell(true)
              },
              {
                icon: 'tag_alt_outline',
                text: 'StarGiftOffer.CreateOffer',
                verify: () => gift._ === 'starGiftUnique' && gift.offer_min_stars !== undefined,
                onClick: () => showCreateStarGiftOfferPopup({
                  gift: this.gift,
                  onFinish: (res) => res === 'created' && this.hide()
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

          <div class="popup-star-gift-info-title">
            {gift._ === 'starGift' ?
              i18n(isUnavailable ? 'StarGiftUnavailableTitle' : isIncoming ? 'StarGiftReceivedTitle' : 'StarGiftTitle') :
              gift.title
            }
          </div>

          <Show when={gift._ ==='starGift'}>
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
            {isIncoming && !isConverted && (
              <div class="popup-star-gift-info-subtitle">
                {i18n('StarGiftReceivedSubtitle', [saved.convert_stars])}
                {' '}
                <a href="https://telegram.org/blog/telegram-stars" target="_blank">
                  {i18n('StarGiftReceivedSubtitleLink')}
                </a>
              </div>
            )}
          </Show>

          {gift._ === 'starGiftUnique' && (
            <div class="popup-star-gift-info-subtitle">
              {
                gift.released_by ?
                  <I18nTsx
                    key="StarGiftCollectibleNumWithAuthor"
                    args={[
                      this.upgradeAnimation ? (
                        <AnimatedCollectibleNumber targetNumber={gift.num} started={upgradeAnimationStarted()} />
                      ) : numberThousandSplitter(gift.num, ','),
                      <PeerTitleTsx
                        peerId={getPeerId(gift.released_by)}
                        username
                        onClick={() => {
                          appImManager.setInnerPeer({peerId: getPeerId(gift.released_by)})
                          this.hide()
                        }}
                      />
                    ]}
                  /> :
                  <I18nTsx
                    key="StarGiftCollectibleNum"
                    args={[
                      this.upgradeAnimation ? (
                        <AnimatedCollectibleNumber targetNumber={gift.num} started={upgradeAnimationStarted()} />
                      ) : numberThousandSplitter(gift.num, ',')
                    ]}
                  />
              }
            </div>
          )}

          {isOwnedUniqueGift && (
            <div class="popup-star-gift-info-actions">
              <Button
                noRipple
                class="popup-star-gift-info-action"
                icon="gem_transfer"
                text="StarGiftTransfer"
                onClick={() => transferStarGift(this.gift).then((ok) => {
                  if(ok) {
                    this.hide();
                  }
                })}
              />
              <Button
                noRipple
                class="popup-star-gift-info-action"
                icon={isWearing() ? 'crownoff' : 'crown'}
                text={isWearing() ? 'StarGiftWearStop' : 'StarGiftWear'}
                onClick={() => {
                  if(isWearing()) {
                    rootScope.managers.appUsersManager.updateEmojiStatus({_: 'emojiStatusEmpty'});
                  } else {
                    PopupStarGiftWear.open(this.gift)
                  }
                }}
              />
              <Button
                noRipple
                class="popup-star-gift-info-action"
                icon={isListed() ? 'tag_alt_crossed' : 'tag_alt'}
                text={isListed() ? 'StarGiftUnlistButton' : 'StarGiftSell'}
                onClick={() => handleSell()}
              />
            </div>
          )}
        </div>

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
      </div>
    );
  }

  private async construct() {
    this.header.remove();
    const gift = this.gift.raw;
    const value = gift._ === 'starGiftUnique' ? await this.managers.appGiftsManager.getGiftValue(gift.slug) : null;
    this.appendSolid(() => this._construct({value}));

    if(this.isResale) {
      const resaleRecipient = this.resaleRecipient ?? rootScope.myId;
      this.btnConfirm.classList.add('popup-star-gift-info-resale-button');
      this.btnConfirm.replaceChildren(
        i18n(resaleRecipient !== rootScope.myId ? 'StarGiftResaleSend' : 'StarGiftResaleBuy', [
          this.gift.resellOnlyTon ?
            paymentsWrapCurrencyAmount(this.gift.resellPriceTon, TON_CURRENCY) :
            paymentsWrapCurrencyAmount(this.gift.resellPriceStars, STARS_CURRENCY)
        ])
      )

      if(this.gift.resellOnlyTon) {
        this.btnConfirm.classList.add('popup-star-gift-info-resale-button-twoline');
        const span = i18n('StarGiftResaleStarsAmount', [
          paymentsWrapCurrencyAmount(this.gift.resellPriceStars, STARS_CURRENCY)
        ])
        span.classList.add('popup-star-gift-info-resale-stars-amount');
        this.btnConfirm.append(span);
      }
    } else if(this.canUpgrade) {
      this.btnConfirm.replaceChildren(
        i18n(this.gift.saved?.prepaid_upgrade_hash ? 'StarGiftGiftUpgrade' : 'StarGiftStatusUpgrade'),
        Icon('arrow_up_circle_fill')
      )
    }

    this.show();
  }
}
