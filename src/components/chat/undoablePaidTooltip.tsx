import {Accessor, createEffect, createRoot, createSignal, onCleanup} from 'solid-js';

import {SEND_PAID_WITH_STARS_DELAY} from '@appManagers/constants';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import classNames from '@helpers/string/classNames';
import eachSecond from '@helpers/eachSecond';
import {animate} from '@helpers/animation';

import {AnimatedCounter} from '@components/animatedCounter';
import showChatToast from '@components/chat/chatToast';


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

    createEffect(() => {
      title.compareAndUpdate({args: [props.titleCount()]});
      subtitle.compareAndUpdate({args: [props.subtitleCount()]});
    });

    createEffect(() => {
      if(!(!!props.sendTime())) {
        dispose();
        hide();
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

    const {hide} = showChatToast({
      animation: 'fade',
      // the undo countdown outlives a chat switch — the send can still be aborted
      closeOnPeerChange: false,
      class: classNames('paid-reaction-tooltip', props.wider && 'paid-reaction-tooltip--a-little-wider'),
      title: title.element,
      textElement: subtitle.element,
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
