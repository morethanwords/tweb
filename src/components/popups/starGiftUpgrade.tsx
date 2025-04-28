import {createEffect, createMemo, createResource, createSignal} from 'solid-js';
import PopupElement from '.';
import {MyStarGift, StarGiftUpgradePreview} from '../../lib/appManagers/appGiftsManager';
import {StarGift, StarGiftAttribute} from '../../layer';
import getUnsafeRandomInt from '../../helpers/number/getUnsafeRandomInt';
import {randomItem, randomItemExcept} from '../../helpers/array/randomItem';
import {i18n} from '../../lib/langPack';
import {IconTsx} from '../iconTsx';
import {I18nTsx} from '../../helpers/solid/i18n';
import {StarGiftBackdrop} from '../stargifts/stargiftBackdrop';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import {rgbIntToHex} from '../../helpers/color';
import wrapSticker from '../wrappers/sticker';
import RLottiePlayer from '../../lib/rlottie/rlottiePlayer';
import RowTsx from '../rowTsx';
import CheckboxFieldTsx from '../checkboxFieldTsx';
import {ButtonIconTsx} from '../buttonIconTsx';
import Icon from '../icon';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import {STARS_CURRENCY} from '../../lib/mtproto/mtproto_config';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import PopupPayment from './payment';

export default class PopupStarGiftUpgrade extends PopupElement {
  private constructor(
    private gift: MyStarGift,
  ) {
    super('popup-star-gift-upgrade', {
      closable: true,
      overlayClosable: true,
      body: true,
      footer: true,
      withConfirm: 'OK',
      withFooterConfirm: true
    });
  }

  private _construct(preview: StarGiftUpgradePreview) {
    this.header.remove();
    this.btnConfirm.replaceChildren(
      this.gift.isUpgradedBySender ? i18n('StarGiftUpgradeFree') : i18n('StarGiftUpgrade', [
        paymentsWrapCurrencyAmount((this.gift.raw as StarGift.starGift).upgrade_stars, STARS_CURRENCY)
      ])
    )

    const keepInfoSignal = createSignal(true);

    attachClickEvent(this.btnConfirm, () => {
      if(this.gift.isUpgradedBySender) {
        this.managers.apiManager.invokeApiSingleProcess({
          method: 'payments.upgradeStarGift',
          params: {
            stargift: this.gift.input,
            keep_original_details: keepInfoSignal[0]()
          }
        }).then(() => this.hide());
      } else {
        PopupPayment.create({
          inputInvoice: {
            _: 'inputInvoiceStarGiftUpgrade',
            stargift: this.gift.input,
            pFlags: {
              keep_original_details: keepInfoSignal[0]() ? true : undefined
            }
          }
        }).then(popup => {
          popup.addEventListener('finish', (result) => {
            if(result === 'paid') {
              this.hide();
            }
          });
        });
      }
    })

    const [model, setModel] = createSignal<StarGiftAttribute.starGiftAttributeModel>();
    const [backdrop, setBackdrop] = createSignal<StarGiftAttribute.starGiftAttributeBackdrop>();
    const [pattern, setPattern] = createSignal<StarGiftAttribute.starGiftAttributePattern>();

    const randomize = () => {
      setModel(v => randomItemExcept(preview.models, v));
      setBackdrop(v => randomItemExcept(preview.backdrops, v));
      setPattern(v => randomItemExcept(preview.patterns, v));
    };
    randomize();

    createEffect(() => {
      const model$ = model();

      wrapSticker({
        doc: model$.document as MyDocument,
        div: stickerContainer,
        width: 120,
        height: 120,
        play: true,
        loop: false,
        middleware: this.middlewareHelper.get()
      }).then(({render}) => render).then((player_)=> {
        const player = player_ as RLottiePlayer;
        player.playOrRestart();
        player.addEventListener('enterFrame', (frameNo) => {
          if(frameNo === player.maxFrame) {
            player.stop(false);
            randomize();
          }
        })
      });
    })

    let stickerContainer!: HTMLDivElement;

    return (
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
            onClick={() => this.hide()}
          />
          <div
            class="popup-star-gift-upgrade-sticker"
            ref={stickerContainer}
          />
          <div class="popup-star-gift-upgrade-title">
            {i18n('StarGiftUpgradeTitle')}
          </div>
          <div class="popup-star-gift-upgrade-subtitle">
            {i18n('StarGiftUpgradeSubtitle')}
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
        <div class='popup-star-gift-upgrade-footer'>
          <RowTsx
            checkboxField={
              <CheckboxFieldTsx
                text="StarGiftUpgradeKeepInfo"
                signal={keepInfoSignal}
              />
            }
          />
        </div>
      </div>
    );
  }

  static async create(gift: MyStarGift) {
    const popup = new PopupStarGiftUpgrade(gift);
    const preview = await popup.managers.appGiftsManager.getUpgradePreview(gift.raw.id);
    popup.appendSolid(() => popup._construct(preview));

    popup.show();
  }
}
