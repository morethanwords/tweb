import PopupElement from '.';
import {StarGift} from '@layer';
import {MyDocument} from '@appManagers/appDocsManager';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {MyStarGift} from '@appManagers/appGiftsManager';
import rootScope from '@lib/rootScope';
import {toastNew} from '@components/toast';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import {StarGiftBackdrop} from '@components/stargifts/stargiftBackdrop';
import {I18nTsx} from '@helpers/solid/i18n';
import safeAssign from '@helpers/object/safeAssign';

import styles from '@components/popups/starGiftWear.module.scss';
import {AvatarNewTsx} from '@components/avatarNew';
import Row from '@components/rowTsx';
import PopupPremium from '@components/popups/premium';
import {getCollectibleName} from '@appManagers/utils/gifts/getCollectibleName';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import classNames from '@helpers/string/classNames';
import {StickerTsx} from '@components/wrappers/sticker';
import PopupBoost from './boost';

export default class PopupStarGiftWear extends PopupElement {
  private gift: MyStarGift;
  private peerId: PeerId;

  constructor(options: {
    gift: MyStarGift,
    peerId?: PeerId
  }) {
    super(styles.popup, {
      closable: true,
      overlayClosable: true,
      body: true,
      footer: true,
      withConfirm: 'StarGiftWearStart',
      withFooterConfirm: true
    });

    safeAssign(this, options);

    this.construct();
  }

  private _construct() {
    const {collectibleAttributes} = this.gift;
    const gift = this.gift.raw as StarGift.starGiftUnique;

    return (
      <div class={/* @once */ styles.container}>
        <div class={/* @once */ classNames(styles.header, 'profile-container need-white is-collapsed')}>
          {gift._ === 'starGiftUnique' && (
            <StarGiftBackdrop
              class={/* @once */ styles.backdrop}
              backdrop={collectibleAttributes.backdrop}
              patternEmoji={collectibleAttributes.pattern.document as MyDocument}
            />
          )}
          <ButtonIconTsx
            class={/* @once */ styles.close}
            icon="close"
            onClick={() => this.hide()}
          />

          <AvatarNewTsx
            class={/* @once */ styles.avatar}
            peerId={this.peerId}
            size={120}
          />

          <div class="profile-avatars-info">
            <div class="profile-name">
              <PeerTitleTsx peerId={this.peerId} withIcons />
              <StickerTsx
                class="emoji-status"
                sticker={this.gift.sticker}
                width={24}
                height={24}
                extraOptions={{play: true, loop: false}}
              />
            </div>
            <div class="profile-subtitle">
              <span class="online"><I18nTsx key="Online" /></span>
            </div>
          </div>
        </div>

        <div class={/* @once */ styles.body}>
          <I18nTsx
            class={/* @once */ styles.title}
            key="StarGiftWearTitle"
            args={[getCollectibleName(gift)]}
          />
          <I18nTsx class={/* @once */ styles.subtitle} key="StarGiftWearSubtitle" />
          <Row>
            <Row.Icon icon="menu_feature_unique" />
            <Row.Title>
              <I18nTsx key="StarGiftWearBenefit1Title" />
            </Row.Title>
            <Row.Subtitle>
              <I18nTsx key="StarGiftWearBenefit1Text" />
            </Row.Subtitle>
          </Row>
          <Row>
            <Row.Icon icon="menu_feature_cover" />
            <Row.Title>
              <I18nTsx key="StarGiftWearBenefit2Title" />
            </Row.Title>
            <Row.Subtitle>
              <I18nTsx key="StarGiftWearBenefit2Text" />
            </Row.Subtitle>
          </Row>
          <Row>
            <Row.Icon icon="menu_verification" />
            <Row.Title>
              <I18nTsx key="StarGiftWearBenefit3Title" />
            </Row.Title>
            <Row.Subtitle>
              <I18nTsx key="StarGiftWearBenefit3Text" />
            </Row.Subtitle>
          </Row>
        </div>
      </div>
    );
  }

  private async construct() {
    this.peerId ||= rootScope.myId;
    this.header.remove();
    this.appendSolid(() => this._construct());

    attachClickEvent(this.btnConfirm, async() => {
      const promise = this.peerId === rootScope.myId ?
        rootScope.managers.appUsersManager.updateEmojiStatus({
          _: 'inputEmojiStatusCollectible',
          collectible_id: this.gift.raw.id
        }) :
        rootScope.managers.apiManager.invokeApiSingleProcess({
          method: 'channels.updateEmojiStatus',
          params: {
            channel: await rootScope.managers.appChatsManager.getChannelInput(this.peerId.toChatId()),
            emoji_status: {
              _: 'inputEmojiStatusCollectible',
              collectible_id: this.gift.raw.id
            }
          }
        }).then((updates) => {
          rootScope.managers.apiUpdatesManager.processUpdateMessage(updates);
        });

      promise.then(() => {
        this.hide();
      }).catch((err: ApiError) => {
        if(err.type === 'BOOSTS_REQUIRED') {
          PopupElement.createPopup(PopupBoost, this.peerId);
          return
        }
        toastNew({langPackKey: 'Error.AnError'});
      });
    });
  }

  static open(gift: MyStarGift, peerId?: PeerId) {
    if(!rootScope.premium) {
      PopupElement.createPopup(PopupPremium);
      return false
    }

    PopupElement.createPopup(PopupStarGiftWear, {gift, peerId}).show();
  }
}
