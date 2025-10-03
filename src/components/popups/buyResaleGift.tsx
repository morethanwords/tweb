import {createEffect, createSignal, on} from 'solid-js';
import PopupElement from '.';
import safeAssign from '../../helpers/object/safeAssign';
import {I18nTsx} from '../../helpers/solid/i18n';
import {MyStarGift} from '../../lib/appManagers/appGiftsManager';
import rootScope from '../../lib/rootScope';
import {PeerTitleTsx} from '../peerTitleTsx';

import styles from './buyResaleGift.module.scss';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import {STARS_CURRENCY, TON_CURRENCY} from '../../lib/mtproto/mtproto_config';
import {StarGift} from '../../layer';
import numberThousandSplitter from '../../helpers/number/numberThousandSplitter';
import {FloatingStarsBalance} from './floatingStarsBalance';
import PopupPayment from './payment';
import {StarGiftTransferPreview} from '../stargifts/transferPreview';
import {ChipTab, ChipTabs} from '../chipTabs';

export default class PopupBuyResaleGift extends PopupElement<{
  finish: (result: boolean) => void
}> {
  private recipientId: PeerId;
  private gift: MyStarGift;

  private finished = false;
  constructor(options: {
    recipientId: PeerId,
    gift: MyStarGift
  }) {
    super(styles.popup, {
      overlayClosable: true,
      body: true
    });

    this.addEventListener('close', () => {
      if(!this.finished) {
        this.dispatchEvent('finish', false);
      }
    });

    safeAssign(this, options);

    this.header.remove()

    this.construct()
  }

  protected async construct() {
    this.appendSolidBody(() => this._construct());
  }

  protected _construct() {
    const [ton, setTon] = createSignal(this.gift.resellOnlyTon ?? false);
    const gift = this.gift.raw as StarGift.starGiftUnique;

    createEffect(on(ton, (ton) => {
      this.setButtons([
        {
          langKey: 'StarGiftResaleBuyConfirm',
          langArgs: [
              ton ?
                paymentsWrapCurrencyAmount(this.gift.resellPriceTon, TON_CURRENCY) :
                paymentsWrapCurrencyAmount(this.gift.resellPriceStars, STARS_CURRENCY)
          ],
          callback: async() => {
            const popup = await PopupPayment.create({
              inputInvoice: {
                _: 'inputInvoiceStarGiftResale',
                pFlags: {ton: ton ? true : undefined},
                slug: gift.slug,
                to_id: await rootScope.managers.appPeersManager.getInputPeerById(this.recipientId)
              },
              noShowIfStars: true,
              purpose: 'stargift'
            });

            popup.addEventListener('finish', (result) => {
              if(result === 'paid' || result === 'pending') {
                this.finished = true;
                this.dispatchEvent('finish', true);
                this.hide()
              }
            });
            return false;
          }
        },
        {
          langKey: 'Cancel',
          callback: () => {
            this.finished = true
            this.dispatchEvent('finish', false);
          }
        }
      ])
    }))

    return (
      <>
        {gift.pFlags.resale_ton_only ? (
          <div class={/* @once */ styles.onlyTon}>
            <I18nTsx key="StarGiftResaleOnlyTon" />
          </div>
        ) : (
          <ChipTabs
            value={ton() ? 'ton' : 'stars'}
            view="primary"
            onChange={(value) => setTon(value === 'ton')}
          >
            <ChipTab value="stars">
              <I18nTsx key="StarGiftResalePayInStars" />
            </ChipTab>
            <ChipTab value="ton">
              <I18nTsx key="StarGiftResalePayInTon" />
            </ChipTab>
          </ChipTabs>
        )}

        <StarGiftTransferPreview
          class={/* @once */ styles.graph}
          gift={this.gift}
          recipient={this.recipientId}
        />

        <I18nTsx class={/* @once */ styles.title} key="ConfirmPayment" />

        <div class={/* @once */ styles.text}>
          <I18nTsx
            key={this.recipientId !== rootScope.myId ? 'StarGiftResaleBuyTextWithRecipient' : 'StarGiftResaleBuyText'}
            args={[
              <span>
                {gift.title}
                &nbsp;#{numberThousandSplitter(gift.num)}
              </span>,
              ton() ?
                paymentsWrapCurrencyAmount(this.gift.resellPriceTon, TON_CURRENCY, false, false, true) :
                paymentsWrapCurrencyAmount(this.gift.resellPriceStars, STARS_CURRENCY, false, false, true),
              this.recipientId !== rootScope.myId && <PeerTitleTsx peerId={this.recipientId} />
            ]}
          />
        </div>
        <FloatingStarsBalance class={styles.starsBalance} ton={ton()} />
      </>
    )
  }
}
