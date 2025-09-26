import classNames from '../../helpers/string/classNames';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import {MyStarGift} from '../../lib/appManagers/appGiftsManager';
import {AvatarNewTsx} from '../avatarNew';
import {IconTsx} from '../iconTsx';
import {StickerTsx} from '../wrappers/sticker';
import {StarGiftBackdrop} from './stargiftBackdrop';
import styles from './transferPreview.module.scss'

export function StarGiftTransferPreview(props: {
  class?: string;
  gift: MyStarGift
  recipient: PeerId
}) {
  return (
    <div class={classNames(styles.graph, props.class)}>
      <div class={/* @once */ styles.giftWrap}>
        <StarGiftBackdrop
          backdrop={props.gift.collectibleAttributes?.backdrop}
          patternEmoji={props.gift.collectibleAttributes?.pattern.document as MyDocument}
          small
          canvasClass={/* @once */ styles.giftBackdropCanvas}
        />
        <StickerTsx
          sticker={props.gift.collectibleAttributes?.model.document as MyDocument}
          width={48}
          height={48}
          autoStyle
          extraOptions={{play: true, loop: true}}
        />
      </div>
      <IconTsx icon="next" />
      <AvatarNewTsx
        peerId={props.recipient}
        size={60}
      />
    </div>
  )
}
