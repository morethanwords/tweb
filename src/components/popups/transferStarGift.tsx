import type {MyStarGift} from '@appManagers/appGiftsManager';
import deferredPromise from '@helpers/cancellablePromise';
import rootScope from '@lib/rootScope';
import PopupPayment from '@components/popups/payment';
import PopupPickUser from '@components/popups/pickUser';
import confirmationPopup from '@components/confirmationPopup';
import {numberThousandSplitterForStars} from '@helpers/number/numberThousandSplitter';
import {MessageAction, StarGift} from '@layer';
import {toastNew} from '@components/toast';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import formatDuration from '@helpers/formatDuration';
import tsNow from '@helpers/tsNow';
import PopupElementOld from '@components/popups/index';
import Row from '@components/row';
import {getCollectibleName} from '@appManagers/utils/gifts/getCollectibleName';
import {passwordPopup} from '@components/popups/password';
import safeWindowOpen from '@helpers/dom/safeWindowOpen';
import {createMemo, createSignal} from 'solid-js';
import PopupElement, {createPopup} from '@components/popups/indexTsx';

import styles from '@components/popups/transferStarGift.module.scss'
import {i18n} from '@lib/langPack';
import {StarGiftTransferPreview} from '@components/stargifts/transferPreview';
import {I18nTsx} from '@helpers/solid/i18n';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import Table, {TableRow} from '@components/table';
import {AttributeValue} from '@components/popups/starGiftInfo';
import paymentsWrapCurrencyAmount, {formatNanoton} from '@helpers/paymentsWrapCurrencyAmount';
import {FloatingStarsBalance} from '@components/popups/floatingStarsBalance';
import {doubleRaf} from '@helpers/schedulers';
import {useAppConfig} from '@stores/appState';
import bigInt from 'big-integer';
import {STARS_CURRENCY, TON_CURRENCY} from '@appManagers/constants';

export function transferStarGiftConfirmationPopup(options: {
  gift: MyStarGift,
  recipient: PeerId,
  fromOffer?: MessageAction.messageActionStarGiftPurchaseOffer
  handleSubmit: () => MaybePromise<void>
  handleCancel?: () => MaybePromise<void>
}) {
  const appConfig = useAppConfig()
  const [show, setShow] = createSignal(false);
  const isFreeTransfer = !options.fromOffer && Number(options.gift.saved?.transfer_stars ?? '0') === 0
  let submitted = false

  const tableContent = createMemo(() => {
    const {gift: {raw: gift, collectibleAttributes}} = options
    if(gift._ !== 'starGiftUnique') return []

    const rows: TableRow[] = [
      ['StarGiftModel', (
        <AttributeValue
          name={collectibleAttributes.model.name}
          rarity={collectibleAttributes.model.rarity}
        />
      )],
      ['StarGiftBackdrop', (
        <AttributeValue
          name={collectibleAttributes.backdrop.name}
          rarity={collectibleAttributes.backdrop.rarity}
        />
      )],
      ['StarGiftPattern', (
        <AttributeValue
          name={collectibleAttributes.pattern.name}
          rarity={collectibleAttributes.pattern.rarity}
        />
      )]
    ];

    if(gift.value_amount) {
      rows.push([
        'StarGiftValue',
        `~${paymentsWrapCurrencyAmount(gift.value_amount, gift.value_currency)}`
      ]);
    }

    return rows
  })

  const popupText = () => {
    if(options.fromOffer) {
      let amount: HTMLElement
      let amountAfterComission: HTMLElement

      if(options.fromOffer.price._ === 'starsTonAmount') {
        amount = i18n('SuggestedPosts.TONAmount', [formatNanoton(options.fromOffer.price.amount, 2)])
        const commission = appConfig.ton_stargift_resale_commission_permille;
        const nanotonAfter = bigInt(options.fromOffer.price.amount as number).multiply(commission).divide(1000).toString()
        amountAfterComission = i18n('SuggestedPosts.TONAmount', [formatNanoton(nanotonAfter, 2)])
      } else {
        amount = i18n('Stars', [numberThousandSplitterForStars(options.fromOffer.price.amount)])
        const commission = appConfig.stars_stargift_resale_commission_permille;
        amountAfterComission = i18n('Stars', [numberThousandSplitterForStars(Math.floor(
          Number(options.fromOffer.price.amount) * (commission / 1000))
        )])
      }

      return (
        <I18nTsx
          class={styles.text}
          key="StarGiftOffer.AcceptOfferText"
          args={[
            getCollectibleName(options.gift.raw as StarGift.starGiftUnique),
            <PeerTitleTsx peerId={options.recipient} onlyFirstName />,
            amount,
            amountAfterComission
          ]}
        />
      )
    }

    return (
      <I18nTsx
        class={styles.text}
        key={isFreeTransfer ? 'StarGiftConfirmFreeTransferText' : 'StarGiftConfirmTransferPopupText'}
        args={[
          getCollectibleName(options.gift.raw as StarGift.starGiftUnique),
          <PeerTitleTsx peerId={options.recipient} onlyFirstName />,
          i18n('Stars', [numberThousandSplitterForStars(options.gift.saved.transfer_stars)])
        ]}
      />
    )
  }

  const submitButtonText = () => {
    if(options.fromOffer) {
      const ton = options.fromOffer.price._ === 'starsTonAmount'

      return (
        <I18nTsx
          key="StarGiftOffer.AcceptOfferButton"
          args={[
            paymentsWrapCurrencyAmount(options.fromOffer.price.amount, ton ? TON_CURRENCY : STARS_CURRENCY)
          ]}
        />
      );
    }

    if(isFreeTransfer) return <I18nTsx key="StarGiftTransferFull" />

    return (
      <I18nTsx
        key="StarGiftTransferFullFor"
        args={[paymentsWrapCurrencyAmount(options.gift.saved.transfer_stars, STARS_CURRENCY)]}
      />
    )
  }

  createPopup(() => {
    doubleRaf().then(() => setShow(true));
    return (
      <PopupElement
        class={styles.popup}
        containerClass={styles.popupContainer}
        show={show()}
        onClose={() => {
          if(!submitted) {
            options.handleCancel?.()
          }
        }}
      >
        <FloatingStarsBalance class={styles.starsBalance} />
        <PopupElement.Body>
          <StarGiftTransferPreview
            class={styles.graph}
            gift={options.gift}
            recipient={options.recipient}
          />

          {popupText()}

          <div class={styles.table}>
            <Table content={tableContent()} />
          </div>
        </PopupElement.Body>
        <PopupElement.Buttons class={styles.buttons}>
          <PopupElement.Button callback={() => {
            submitted = true
            return options.handleSubmit()
          }}>
            {submitButtonText()}
          </PopupElement.Button>
          <PopupElement.Button cancel callback={() => {
            submitted = true
            options.handleCancel?.()
          }}>
            <I18nTsx key="Cancel" />
          </PopupElement.Button>
        </PopupElement.Buttons>
      </PopupElement>
    )
  })
}

export default function transferStarGift(gift: MyStarGift, toPeerId?: PeerId): Promise<boolean> {
  const {saved, input} = gift;
  const raw = gift.raw as StarGift.starGiftUnique;

  const now = tsNow(true);
  if(saved.can_transfer_at !== undefined && saved.can_transfer_at > now) {
    toastNew({
      langPackKey: 'StarGiftTransferCooldown',
      langPackArguments: [wrapFormattedDuration(formatDuration(saved.can_transfer_at - now, 2))]
    });
    return Promise.resolve(false);
  }

  const deferred = deferredPromise<boolean>();
  let peerSelectorResolved = false;
  async function handleSelection(peerId: PeerId | 'fragment') {
    if(peerSelectorResolved) return;
    peerSelectorResolved = true;

    if(peerId === 'fragment') {
      try {
        await confirmationPopup({
          titleLangKey: 'StarGiftFragmentTransferTitle',
          descriptionLangKey: 'StarGiftFragmentTransferText',
          descriptionLangArgs: [getCollectibleName(raw)],
          button: {
            langKey: 'StarGiftFragmentTransferConfirm'
          }
        })

        const url = await passwordPopup({
          titleLangKey: 'PleaseEnterCurrentPassword',
          descriptionLangKey: 'StarGiftFragmentTransferPassword',
          descriptionLangArgs: [getCollectibleName(raw)],
          button: {
            langKey: 'Confirm'
          },
          callback: (password) => rootScope.managers.apiManager.invokeApi('payments.getStarGiftWithdrawalUrl', {
            stargift: input,
            password: password
          })
        })

        safeWindowOpen(url.url);

        deferred.resolve(true);
      } catch(e) {
        deferred.resolve(false);
      }
      return
    }

    transferStarGiftConfirmationPopup({
      gift,
      recipient: peerId,
      handleSubmit: async() => {
        const inputPeer = await rootScope.managers.appPeersManager.getInputPeerById(peerId);

        if(Number(saved?.transfer_stars ?? '0') === 0) {
          await rootScope.managers.appGiftsManager.transferStarGift(gift.input, peerId);
          deferred.resolve(true)
        } else {
          const popup = await PopupPayment.create({
            inputInvoice: {
              _: 'inputInvoiceStarGiftTransfer',
              stargift: gift.input,
              to_id: inputPeer
            },
            noShowIfStars: true
          });

          popup.addEventListener('finish', (result) => {
            if(result === 'paid') {
              deferred.resolve(true);
            } else {
              deferred.resolve(false);
            }
          });
        }
      },
      handleCancel: () => deferred.resolve(false)
    })
  }

  if(toPeerId) {
    handleSelection(toPeerId);
    return deferred;
  }

  const popup = PopupElementOld.createPopup(PopupPickUser, {
    placeholder: 'StarGiftTransferTo',
    onSelect: handleSelection,
    exceptSelf: true,
    filterPeerTypeBy: ['isRegularUser', 'isBroadcast']
  });

  if(saved.can_export_at !== undefined && saved.can_export_at < now) {
    const fragmentRow = new Row({
      titleLangKey: 'StarGiftFragmentTransferItem',
      icon: 'ton',
      clickable: () => {
        handleSelection('fragment');
        popup.hide();
      }
    });
    popup.selector.list.before(fragmentRow.container);
  }

  popup.addEventListener('close', () => {
    if(!peerSelectorResolved) {
      deferred.resolve(false);
    }
  }, {once: true});

  return deferred;
}
