import classNames from '@helpers/string/classNames';
import {MyStarGift} from '@appManagers/appGiftsManager';
import {AvatarNewTsx} from '@components/avatarNew';
import {IconTsx} from '@components/iconTsx';
import {StarGiftPreview} from '@components/stargifts/starGiftPreview';
import styles from '@components/stargifts/transferPreview.module.scss'

export function StarGiftTransferPreview(props: {
  class?: string;
  gift: MyStarGift
  recipient: PeerId
}) {
  return (
    <div class={classNames(styles.graph, props.class)}>
      <StarGiftPreview
        gift={props.gift}
        class={/* @once */ styles.giftWrap}
        canvasClass={/* @once */ styles.giftBackdropCanvas}
        stickerSize={48}
        stickerOptions={{play: true, loop: true}}
      />
      <IconTsx icon="next" />
      <AvatarNewTsx
        peerId={props.recipient}
        size={60}
      />
    </div>
  )
}
