import {JSX} from 'solid-js';
import {MyStarGift} from '@appManagers/appGiftsManager';
import {i18n} from '@lib/langPack';
import {PremiumGiftBubble} from '@components/chat/bubbles/premiumGift';
import {StarGiftPreview} from '@components/stargifts/starGiftPreview';
import {StickerTsxExtraOptions} from '@components/wrappers/sticker';
import styles from '@components/chat/bubbles/chatThemeGift.module.scss';

/** A gift made the chat's theme: the gift with the service text under it, as tdesktop shows it. */
export function ChatThemeGiftBubble(props: {
  gift: MyStarGift,
  text: JSX.Element,
  stickerOptions: StickerTsxExtraOptions,
  onView: () => void
}) {
  return (
    <PremiumGiftBubble
      media={
        <StarGiftPreview
          gift={props.gift}
          class={styles.preview}
          canvasClass={styles.backdrop}
          stickerSize={64}
          stickerOptions={props.stickerOptions}
        />
      }
      subtitle={props.text}
      buttonText={i18n('ActionGiftPremiumView')}
      buttonCallback={props.onView}
    />
  );
}
