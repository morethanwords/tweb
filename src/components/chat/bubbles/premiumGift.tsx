import {JSX} from 'solid-js';
import liteMode from '@helpers/liteMode';
import lottieLoader, {LottieAssetName} from '@lib/lottie/lottieLoader';
import Button from '@components/buttonTsx';
import LottieAnimation from '@components/lottieAnimation';
import {LottieOptions} from '@lib/lottie/lottiePlayer';

import styles from '@components/chat/bubbles/premiumGift.module.scss';
import stylesCommon from '@components/chat/bubbles/service.module.scss';
import classNames from '@helpers/string/classNames';
import {MyDocument} from '@appManagers/appDocsManager';
import {StickerTsx} from '@components/wrappers/sticker';

export function PremiumGiftBubble(props: {
  assetName?: LottieAssetName
  sticker?: MyDocument
  title: JSX.Element
  subtitle: JSX.Element
  buttonText?: JSX.Element
  buttonCallback?: () => void
  lottieOptions?: Partial<LottieOptions>
}) {
  return (
    <div class={/* @once */ classNames(styles.bubble, stylesCommon.addon)}>
      {props.sticker && (
        <StickerTsx
          sticker={props.sticker}
          width={160}
          height={160}
          autoStyle={true}
          class={styles.sticker}
          extraOptions={{
            play: liteMode.isAvailable('stickers_chat'),
            middleware: props.lottieOptions?.middleware
          }}
        />
      )}
      {props.assetName && (
        <LottieAnimation
          class={/* @once */ styles.sticker}
          size={160}
          name={props.assetName}
          lottieLoader={lottieLoader}
          lottieOptions={{
            autoplay: liteMode.isAvailable('stickers_chat'),
            ...props.lottieOptions
          }}
        />
      )}

      <span class="text-bold">{props.title}</span>
      <span class={/* @once */ styles.subtitle}>
        {props.subtitle}
      </span>
      {props.buttonText && (
        <Button
          class="bubble-service-button"
          onClick={props.buttonCallback}
        >
          {props.buttonText}
        </Button>
      )}
    </div>
  );
}
