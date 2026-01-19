import {onMount, Show} from 'solid-js';
import {monthsLocalized} from '@helpers/date';
import liteMode from '@helpers/liteMode';
import {I18nTsx} from '@helpers/solid/i18n';
import {Birthday} from '@layer';
import lottieLoader from '@lib/rlottie/lottieLoader';
import LottieAnimation from '@components/lottieAnimation';


import styles from '@components/chat/bubbles/suggestBirthday.module.scss';
import Button from '@components/buttonTsx';
import showBirthdayPopup, {saveMyBirthday} from '@components/popups/birthday';
import rootScope from '@lib/rootScope';
import {toastNew} from '@components/toast';

export function SuggestBirthdayBubble(props: {
  birthday: Birthday
  title: HTMLElement
  outgoing: boolean
}) {
  return (
    <div class={/* @once */ styles.wrap}>
      <LottieAnimation
        class={/* @once */ styles.cake}
        size={96}
        name="Cake"
        lottieLoader={lottieLoader}
        needRaf
        rlottieOptions={{
          autoplay: liteMode.isAvailable('stickers_chat')
        }}
      />

      {props.title}

      <div class={/* @once */ styles.content}>
        <div class={/* @once */ styles.col}>
          <I18nTsx class={/* @once */ styles.label} key="BirthdayPopup.Day" />
          {props.birthday.day}
        </div>
        <div class={/* @once */ styles.col}>
          <I18nTsx class={/* @once */ styles.label} key="BirthdayPopup.Month" />
          {monthsLocalized[props.birthday.month - 1]}
        </div>
        <Show when={props.birthday.year}>
          <div class={/* @once */ styles.col}>
            <I18nTsx class={/* @once */ styles.label} key="BirthdayPopup.Year" />
            {props.birthday.year}
          </div>
        </Show>
      </div>

      <Show when={!props.outgoing}>
        <Button
          class="bubble-service-button"
          onClick={() => showBirthdayPopup({
            initialDate: props.birthday,
            fromSuggestion: true,
            onSave: saveMyBirthday
          })}
        >
          <I18nTsx key="BirthdaySuggestView" />
        </Button>
      </Show>
    </div>
  )
}
