import {JSX} from 'solid-js';
import liteMode from '@helpers/liteMode';
import lottieLoader, {LottieAssetName} from '@lib/rlottie/lottieLoader';
import Button from '@components/buttonTsx';
import LottieAnimation from '@components/lottieAnimation';
import {RLottieOptions} from '@lib/rlottie/rlottiePlayer';

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
  rlottieOptions?: Partial<RLottieOptions>
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
            middleware: props.rlottieOptions?.middleware
          }}
        />
      )}
      {props.assetName && (
        <LottieAnimation
          class={/* @once */ styles.sticker}
          size={160}
          name={props.assetName}
          lottieLoader={lottieLoader}
          rlottieOptions={{
            autoplay: liteMode.isAvailable('stickers_chat'),
            ...props.rlottieOptions
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
