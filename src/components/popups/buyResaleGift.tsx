import {createEffect, createSignal, on} from 'solid-js';
import PopupElement from '.';
import safeAssign from '../../helpers/object/safeAssign';
import {I18nTsx} from '../../helpers/solid/i18n';
import {MyStarGift} from '../../lib/appManagers/appGiftsManager';
import rootScope from '../../lib/rootScope';
import {AvatarNewTsx} from '../avatarNew';
import {IconTsx} from '../iconTsx';
import {PeerTitleTsx} from '../peerTitleTsx';

import styles from './buyResaleGift.module.scss';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import {STARS_CURRENCY, TON_CURRENCY} from '../../lib/mtproto/mtproto_config';
import {StarGift} from '../../layer';
import {StarGiftBackdrop} from '../stargifts/stargiftBackdrop';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import {MTAppConfig} from '../../lib/mtproto/appConfig';
import {StickerTsx} from '../wrappers/sticker';
import classNames from '../../helpers/string/classNames';
import numberThousandSplitter from '../../helpers/number/numberThousandSplitter';
import {FloatingStarsBalance} from './floatingStarsBalance';
import PopupPayment from './payment';

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
    const [appConfig, patternDoc, modelDoc] = await Promise.all([
      this.managers.apiManager.getAppConfig(),
      this.managers.appDocsManager.getDoc(this.gift.collectibleAttributes?.pattern.document.id as number),
      this.managers.appDocsManager.getDoc(this.gift.collectibleAttributes?.model.document.id as number)
    ])
    this.appendSolidBody(() => this._construct({appConfig, patternDoc, modelDoc}));
  }

  protected _construct({appConfig, patternDoc, modelDoc}: {appConfig: MTAppConfig, patternDoc: MyDocument, modelDoc: MyDocument}) {
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
          <div class={/* @once */ styles.tabs}>
            <div class={classNames(styles.tab, !ton() && styles.activeTab)} onClick={() => setTon(false)}>
              <I18nTsx key="StarGiftResalePayInStars" />
            </div>
            <div class={classNames(styles.tab, ton() && styles.activeTab)} onClick={() => setTon(true)}>
              <I18nTsx key="StarGiftResalePayInTon" />
            </div>
          </div>
        )}
        <div class={/* @once */ styles.graph}>
          <div class={/* @once */ styles.giftWrap}>
            <StarGiftBackdrop
              backdrop={this.gift.collectibleAttributes?.backdrop}
              patternEmoji={patternDoc}
              small
              canvasClass={/* @once */ styles.giftBackdropCanvas}
            />
            <StickerTsx
              sticker={modelDoc}
              width={48}
              height={48}
              autoStyle
              extraOptions={{play: true, loop: true}}
            />
          </div>
          <IconTsx icon="next" />
          <AvatarNewTsx
            peerId={this.recipientId}
            size={64}
          />
        </div>

        <div class={/* @once */ styles.text}>
          <I18nTsx
            key="StarGiftResaleBuyText"
            args={[
              <span>
                {gift.title}
                &nbsp;#{numberThousandSplitter(gift.num)}
              </span>,
              ton() ?
                paymentsWrapCurrencyAmount(this.gift.resellPriceTon, TON_CURRENCY, false, false, true) :
                paymentsWrapCurrencyAmount(this.gift.resellPriceStars, STARS_CURRENCY, false, false, true)
            ]}
          />
        </div>
        <FloatingStarsBalance class={styles.starsBalance} ton={ton()} />
      </>
    )
  }
}
