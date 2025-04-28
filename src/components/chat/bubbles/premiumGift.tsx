import {JSX} from 'solid-js/jsx-runtime'
import liteMode from '../../../helpers/liteMode'
import lottieLoader, {LottieAssetName} from '../../../lib/rlottie/lottieLoader'
import Button from '../../buttonTsx'
import LottieAnimation from '../../lottieAnimation'
import {RLottieOptions} from '../../../lib/rlottie/rlottiePlayer'

import styles from './premiumGift.module.scss'
import stylesCommon from './service.module.scss'
import classNames from '../../../helpers/string/classNames'

export function PremiumGiftBubble(props: {
  assetName: LottieAssetName
  title: JSX.Element
  subtitle: JSX.Element
  buttonText?: JSX.Element
  buttonCallback?: () => void
  rlottieOptions?: Partial<RLottieOptions>
}) {
  return (
    <div class={/* @once */ classNames(styles.bubble, stylesCommon.addon)}>
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
  )
}
