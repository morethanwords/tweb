/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createRoot, createSignal, onCleanup} from 'solid-js';
import {animate} from '../../helpers/animation';
import eachSecond from '../../helpers/eachSecond';
import I18n, {i18n} from '../../lib/langPack';
import {SEND_PAID_REACTION_DELAY} from '../../lib/mtproto/mtproto_config';
import showTooltip from '../tooltip';
import type {PendingPaidReaction} from './reactions';
import type ReactionsElement from './reactions';
import {AnimatedCounter} from '../animatedCounter';
import appImManager from '../../lib/appManagers/appImManager';

export default function showPaidReactionTooltip(props: {
  reactionsElement: ReactionsElement,
  reactionElement: HTMLElement,
  pending: PendingPaidReaction
}) {
  createRoot((dispose) => {
    const [secondsLeft, setSecondsLeft] = createSignal<number>();
    const [progressCircumference, setProgressCircumference] = createSignal<number>();

    const title = new I18n.IntlElement({key: 'PaidReaction.Sent'});
    const subtitle = new I18n.IntlElement({key: 'StarsSentText'});
    title.element.classList.add('text-bold');

    createEffect(() => {
      [title, subtitle].forEach((el) => {
        el.compareAndUpdate({args: [props.pending.count()]});
      });
    });

    createEffect(() => {
      if(!(props.reactionsElement.hasPaidTooltip = !!props.pending.sendTime())) {
        dispose();
        close();
      } else {
        const disposeTimer = eachSecond(() => {
          setSecondsLeft((props.pending.sendTime() - Date.now()) / 1000 | 0);
        });

        animate(() => {
          const progress = (props.pending.sendTime() - Date.now()) / SEND_PAID_REACTION_DELAY;
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

    const countdown = new AnimatedCounter({reverse: false})
    createEffect(() => countdown.setCount(secondsLeft()))

    const {close} = showTooltip({
      element: appImManager.chat.bubbles.container,
      container: appImManager.chat.bubbles.container,
      mountOn: appImManager.chat.bubbles.container,
      relative: true,
      vertical: 'top',
      class: 'paid-reaction-tooltip',
      textElement: title.element,
      subtitleElement: subtitle.element,
      rightElement: (
        <span
          class="tooltip-undo"
          onClick={() => props.pending.abortController.abort()}
        >
          {i18n('StarsSentUndo')}
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
