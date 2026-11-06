import classNames from '@helpers/string/classNames';
import {MyDocument} from '@appManagers/appDocsManager';
import {MyStarGift} from '@appManagers/appGiftsManager';
import {StarGiftBackdrop} from '@components/stargifts/stargiftBackdrop';
import {StickerTsx, StickerTsxExtraOptions} from '@components/wrappers/sticker';
import styles from '@components/stargifts/starGiftPreview.module.scss';

/** A collectible gift's model on its backdrop and pattern. The size comes with `class`. */
export function StarGiftPreview(props: {
  gift: MyStarGift,
  stickerSize: number,
  class?: string,
  canvasClass?: string,
  stickerOptions?: StickerTsxExtraOptions
}) {
  return (
    <div class={classNames(styles.wrap, props.class)}>
      <StarGiftBackdrop
        backdrop={props.gift.collectibleAttributes?.backdrop}
        patternEmoji={props.gift.collectibleAttributes?.pattern.document as MyDocument}
        small
        canvasClass={props.canvasClass}
      />
      <StickerTsx
        sticker={props.gift.collectibleAttributes?.model.document as MyDocument}
        width={props.stickerSize}
        height={props.stickerSize}
        autoStyle
        extraOptions={props.stickerOptions ?? {play: true}}
      />
    </div>
  );
}
