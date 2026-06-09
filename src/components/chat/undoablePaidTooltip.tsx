import {Accessor, createEffect, createRoot, createSignal, onCleanup} from 'solid-js';

import {SEND_PAID_WITH_STARS_DELAY} from '@appManagers/constants';
import appImManager from '@lib/appImManager';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import classNames from '@helpers/string/classNames';
import eachSecond from '@helpers/eachSecond';
import {animate} from '@helpers/animation';

import {AnimatedCounter} from '@components/animatedCounter';
import showTooltip from '@components/tooltip';


type LangKeys = {
  titleKey: LangPackKey;
  subtitleKey: LangPackKey;
};

export const paidReactionLangKeys: LangKeys = {
  titleKey: 'PaidReaction.Sent',
  subtitleKey: 'StarsSentText'
};

export const paidMessagesLangKeys: LangKeys = {
  titleKey: 'PaidMessages.MessagesSent',
  subtitleKey: 'PaidMessages.YouPaidForMessages'
};


export default function showUndoablePaidTooltip(props: {
  sendTime: Accessor<number>;
  titleCount: Accessor<number>;
  subtitleCount: Accessor<number>;
  onUndo: () => void;
  wider?: boolean;
} & LangKeys) {
  createRoot((dispose) => {
    const [secondsLeft, setSecondsLeft] = createSignal<number>();
    const [progressCircumference, setProgressCircumference] = createSignal<number>();

    const title = new I18n.IntlElement({key: props.titleKey});
    const subtitle = new I18n.IntlElement({key: props.subtitleKey});
    title.element.classList.add('text-bold');

    createEffect(() => {
      title.compareAndUpdate({args: [props.titleCount()]});
      subtitle.compareAndUpdate({args: [props.subtitleCount()]});
    });

    createEffect(() => {
      if(!(!!props.sendTime())) {
        dispose();
        close();
      } else {
        const disposeTimer = eachSecond(() => {
          setSecondsLeft((props.sendTime() - Date.now()) / 1000 | 0);
        });

        animate(() => {
          const progress = (props.sendTime() - Date.now()) / SEND_PAID_WITH_STARS_DELAY;
          setProgressCircumference(progress * circumference);
          return !cleaned;
        });

        let cleaned = false;
        onCleanup(() => {
          cleaned = true;
          disposeTimer();
        });
      }
    });

    const size = 24;
    const radius = 10;
    const circumference = radius * 2 * Math.PI;

    const countdown = new AnimatedCounter({reverse: false});
    createEffect(() => countdown.setCount(secondsLeft()));

    const {close} = showTooltip({
      // Mount on the .chat element (sibling to .topbar / .bubbles), NOT inside
      // .bubbles: .bubbles is position:absolute; z-index:1 with a transform, so it
      // forms a stacking context that would trap this position:fixed; z-index:5
      // tooltip below the topbar (z-index:2) and chat input. At the .chat level the
      // tooltip's z-index competes directly and renders above the chat chrome.
      element: appImManager.chat.container,
      container: appImManager.chat.container,
      mountOn: appImManager.chat.container,
      relative: true,
      vertical: 'top',
      class: classNames('paid-reaction-tooltip', props.wider && 'paid-reaction-tooltip--a-little-wider'),
      textElement: title.element,
      subtitleElement: subtitle.element,
      rightElement: (
        <span
          class="tooltip-undo"
          onClick={() => void props.onUndo()}
        >
          {i18n('Undo')}
          <span class="tooltip-undo-timer">
            <svg class="tooltip-undo-timer-svg" width={size + 'px'} height={size + 'px'}>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                class="tooltip-undo-timer-circle"
                transform={`rotate(-90, ${size / 2}, ${size / 2})`}
                stroke-dasharray={`${progressCircumference()} ${circumference}`}
              ></circle>
            </svg>
            <span class="tooltip-undo-timer-number">
              {countdown.container}
            </span>
          </span>
        </span>
      ),
      icon: 'star'
    });
  });
}
