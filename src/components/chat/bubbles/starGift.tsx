import {createMemo} from 'solid-js';
import {StarGift, TextWithEntities} from '../../../layer';
import wrapRichText from '../../../lib/richTextProcessor/wrapRichText';
import {AvatarNewTsx} from '../../avatarNew';
import Button from '../../buttonTsx';
import {StickerTsx, StickerTsxExtraOptions} from '../../wrappers/sticker';
import {PeerTitleTsx} from '../../peerTitleTsx';

import styles from './starGift.module.scss';
import stylesCommon from './service.module.scss';
import {Sparkles} from '../../sparkles';
import classNames from '../../../helpers/string/classNames';
import {I18nTsx} from '../../../helpers/solid/i18n';
import {MyStarGift} from '../../../lib/appManagers/appGiftsManager';
import {StarGiftBadge} from '../../stargifts/stargiftBadge';
import {StarGiftBackdrop} from '../../stargifts/stargiftBackdrop';
import {MyDocument} from '../../../lib/appManagers/appDocsManager';
import numberThousandSplitter from '../../../helpers/number/numberThousandSplitter';
import PopupElement from '../../popups';
import PopupStarGiftInfo from '../../popups/starGiftInfo';

function shortNumberFormat(num: number) {
  if(num > 1000) {
    const thousands = Math.floor(num / 1000);
    return thousands + 'k';
  }
  return String(num)
}

export function StarGiftBubble(props: {
  gift: MyStarGift

  fromId: PeerId
  asUpgrade?: boolean;
  ownerId?: PeerId;
  message?: TextWithEntities;
  wrapStickerOptions?: StickerTsxExtraOptions;
  onViewClick?: () => void;
}) {
  const message = createMemo(() => {
    if(props.gift.raw._ === 'starGiftUnique') {
      return (
        <div class={/* @once */ styles.uniqueGiftInfo}>
          <div class={/* @once */ styles.uniqueGiftTitle}>
            {props.gift.raw.title} #{numberThousandSplitter(props.gift.raw.num, ',')}
          </div>

          <div class={/* @once */ styles.uniqueGiftProps}>
            <I18nTsx class={/* @once */ styles.uniqueGiftPropName} key="StarGiftModel" />
            <div class={/* @once */ styles.uniqueGiftPropValue}>
              {props.gift.collectibleAttributes.model.name}
            </div>
            <I18nTsx class={/* @once */ styles.uniqueGiftPropName} key="StarGiftBackdrop" />
            <div class={/* @once */ styles.uniqueGiftPropValue}>
              {props.gift.collectibleAttributes.backdrop.name}
            </div>
            <I18nTsx class={/* @once */ styles.uniqueGiftPropName} key="StarGiftPattern" />
            <div class={/* @once */ styles.uniqueGiftPropValue}>
              {props.gift.collectibleAttributes.pattern.name}
            </div>
          </div>
        </div>
      )
    }

    if(props.message) {
      return wrapRichText(props.message.text, {entities: props.message.entities});
    }

    if(props.asUpgrade && props.ownerId) {
      return (
        <I18nTsx
          key="StarGiftDefaultMessageUpgradeOut"
          args={<PeerTitleTsx peerId={props.ownerId} />}
        />
      )
    }

    if(props.asUpgrade) {
      return <I18nTsx key="StarGiftDefaultMessageUpgrade" />
    }

    if(props.gift.raw.convert_stars !== undefined && !props.gift.isUpgraded) {
      return props.gift.isIncoming ? (
        <I18nTsx
          key="StarGiftDefaultMessageConvertable"
          args={<span>{props.gift.raw.convert_stars}</span>}
        />
      ) : (
        <I18nTsx
          key="StarGiftDefaultMessageConvertable"
          args={[
            <PeerTitleTsx peerId={props.ownerId} />,
            <span>{props.gift.raw.convert_stars}</span>
          ]}
        />
      );
    }

    return props.gift.isIncoming ? (
      <I18nTsx key="StarGiftDefaultMessage" />
    ) : (
      <I18nTsx
        key="StarGiftDefaultMessageOut"
        args={<PeerTitleTsx peerId={props.ownerId} />}
      />
    );
  });

  return (
    <div class={/* @once */ classNames(
      styles.bubble,
      props.gift.raw._ === 'starGiftUnique' && styles.bubbleIsUnique,
      stylesCommon.addon
    )}>
      {props.gift.raw.availability_total && (
        <StarGiftBadge class={/* @once */ styles.badge}>
          <I18nTsx
            key="StarGiftLimitedBadgeNum"
            args={[shortNumberFormat(props.gift.raw.availability_total)]}
          />
        </StarGiftBadge>
      )}
      {props.gift.collectibleAttributes && (
        <StarGiftBackdrop
          class={/* @once */ styles.backdrop}
          backdrop={props.gift.collectibleAttributes.backdrop}
          patternEmoji={props.gift.collectibleAttributes.pattern.document as MyDocument}
        />
      )}
      <StickerTsx
        class={/* @once */ styles.sticker}
        sticker={props.gift.sticker}
        width={120}
        height={120}
        extraOptions={props.wrapStickerOptions}
      />

      <I18nTsx
        key="StarGiftFrom"
        class={/* @once */ styles.from}
        args={
          <div class={/* @once */ styles.fromUser}>
            <AvatarNewTsx peerId={props.fromId} size={16} />
            <PeerTitleTsx peerId={props.fromId} />
          </div>
        }
      />

      <div class={/* @once */ styles.message}>
        {message()}
      </div>

      {props.asUpgrade ? (
        <Button
          class={/* @once */ classNames('bubble-service-button', styles.upgradeButton)}
          onClick={props.onViewClick}
          iconAfter="unpack"
        >
          <Sparkles mode="button" isDiv />
          <I18nTsx key="ActionGiftPremiumUnpack" />
        </Button>
      ) : (
        <Button
          class='bubble-service-button'
          onClick={props.onViewClick}
        >
          <Sparkles mode="button" isDiv />
          <I18nTsx key="ActionGiftPremiumView" />
        </Button>
      )}
    </div>
  )
}

export function UniqueStarGiftWebPageBox(props: {
  gift: MyStarGift
  wrapStickerOptions?: StickerTsxExtraOptions
}) {
  return (
    <div
      class={/* @once */ styles.webPageBox}
      onClick={() => {
        PopupElement.createPopup(PopupStarGiftInfo, props.gift);
      }}
    >
      <StarGiftBackdrop
        class={/* @once */ styles.webPageBackdrop}
        canvasClass={/* @once */ styles.webPageBackdropCanvas}
        backdrop={props.gift.collectibleAttributes.backdrop}
        patternEmoji={props.gift.collectibleAttributes.pattern.document as MyDocument}
      />
      <StickerTsx
        class={/* @once */ styles.webPageSticker}
        width={120}
        height={120}
        extraOptions={props.wrapStickerOptions}
        sticker={props.gift.collectibleAttributes.model.document as MyDocument}
      />
    </div>
  )
}
