import {createEffect, createSignal} from 'solid-js';
import PopupElement from '.';
import {MyStarGift, StarGiftUpgradePreview} from '../../lib/appManagers/appGiftsManager';
import {StarGift, StarGiftAttribute} from '../../layer';
import {randomItemExcept} from '../../helpers/array/randomItem';
import {i18n} from '../../lib/langPack';
import {IconTsx} from '../iconTsx';
import {I18nTsx} from '../../helpers/solid/i18n';
import {StarGiftBackdrop} from '../stargifts/stargiftBackdrop';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import wrapSticker from '../wrappers/sticker';
import RLottiePlayer from '../../lib/rlottie/rlottiePlayer';
import RowTsx from '../rowTsx';
import CheckboxFieldTsx from '../checkboxFieldTsx';
import {ButtonIconTsx} from '../buttonIconTsx';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import {STARS_CURRENCY} from '../../lib/mtproto/mtproto_config';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import PopupPayment from './payment';
import wrapPeerTitle from '../wrappers/peerTitle';
import toggleDisability from '../../helpers/dom/toggleDisability';

export default class PopupStarGiftUpgrade extends PopupElement {
  private constructor(
    private gift: MyStarGift,
    private descriptionForPeerId?: PeerId
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

  private _construct(preview: StarGiftUpgradePreview, peerTitle?: HTMLElement) {
    this.header.remove();
    this.footer.classList.add('abitlarger');
    const freeUpgrade = this.gift.isUpgradedBySender || this.gift.saved?.upgrade_stars !== undefined;
    if(this.descriptionForPeerId) {
      this.btnConfirm.replaceChildren(i18n('OK'));
    } else {
      this.btnConfirm.replaceChildren(
        freeUpgrade ? i18n('StarGiftUpgradeFree') : i18n('StarGiftUpgrade', [
          paymentsWrapCurrencyAmount((this.gift.raw as StarGift.starGift).upgrade_stars, STARS_CURRENCY)
        ])
      );
    }

    const keepInfoSignal = createSignal(true);

    attachClickEvent(this.btnConfirm, () => {
      if(this.descriptionForPeerId) {
        this.hide();
      } else if(freeUpgrade) {
        const toggle = toggleDisability(this.btnConfirm, true);
        this.managers.appGiftsManager.upgradeStarGift(
          this.gift.input,
          keepInfoSignal[0]()
        ).then(() => this.hide(), toggle);
      } else {
        const toggle = toggleDisability(this.btnConfirm, true);
        PopupPayment.create({
          inputInvoice: {
            _: 'inputInvoiceStarGiftUpgrade',
            stargift: this.gift.input,
            pFlags: {
              keep_original_details: keepInfoSignal[0]() ? true : undefined
            }
          },
          noShowIfStars: true
        }).then((popup) => {
          popup.addEventListener('finish', (result) => {
            if(result === 'paid') {
              this.hide();
            } else {
              toggle();
            }
          });
        });
      }
    });

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
            {i18n(this.descriptionForPeerId ? 'StarGiftUpgradeTitleFor' : 'StarGiftUpgradeTitle')}
          </div>
          <div class="popup-star-gift-upgrade-subtitle">
            {i18n(this.descriptionForPeerId ? 'StarGiftUpgradeSubtitleFor' : 'StarGiftUpgradeSubtitle', [peerTitle])}
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
        {!this.descriptionForPeerId && (
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
        )}
      </div>
    );
  }

  static async create(gift: MyStarGift, descriptionForPeerId?: PeerId) {
    const popup = new PopupStarGiftUpgrade(gift, descriptionForPeerId);
    const preview = await popup.managers.appGiftsManager.getUpgradePreview(gift.raw.id);
    const peerTitle = descriptionForPeerId ? await wrapPeerTitle({peerId: descriptionForPeerId}) : undefined;
    popup.appendSolid(() => popup._construct(preview, peerTitle));

    popup.show();
  }
}
