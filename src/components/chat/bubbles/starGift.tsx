import {onMount} from 'solid-js';
import {TextWithEntities} from '../../../layer';
import {i18n} from '../../../lib/langPack';
import wrapRichText from '../../../lib/richTextProcessor/wrapRichText';
import {AvatarNewTsx} from '../../avatarNew';
import Button from '../../buttonTsx';
import {StickerTsx, StickerTsxExtraOptions} from '../../wrappers/sticker';
import {MyDocument} from '../../../lib/appManagers/appDocsManager';
import {PeerTitleTsx} from '../../peerTitleTsx';

import styles from './starGift.module.scss';
import stylesCommon from './service.module.scss';
import {Sparkles} from '../../sparkles';
import classNames from '../../../helpers/string/classNames';

export function StarGiftBubble(props: {
  sticker: MyDocument;
  wrapStickerOptions?: StickerTsxExtraOptions;
  fromId: PeerId;
  starsAmount: Long;
  message?: TextWithEntities;
  onViewClick?: () => void;
}) {
  return (
    <div class={/* @once */ classNames(styles.bubble, stylesCommon.addon)}>
      <StickerTsx
        class={/* @once */ styles.sticker}
        sticker={props.sticker}
        width={120}
        height={120}
        extraOptions={props.wrapStickerOptions}
      />

      <div class={/* @once */ styles.from}>
        {i18n('StarGiftFrom')}
        <div class={/* @once */ styles.fromUser}>
          <AvatarNewTsx peerId={props.fromId} size={16} />
          <PeerTitleTsx peerId={props.fromId} />
        </div>
      </div>

      <div class={/* @once */ styles.message}>
        {props.message ?
          wrapRichText(props.message.text, {entities: props.message.entities}) :
          i18n('StarGiftDefaultMessage', [props.starsAmount])
        }
      </div>

      <Button
        class='bubble-service-button'
        onClick={props.onViewClick}
      >
        <Sparkles mode="button" isDiv />
        {i18n('ActionGiftPremiumView')}
      </Button>
    </div>
  )
}
