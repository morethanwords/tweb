/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createSignal, For, on, untrack, JSX, onCleanup, getOwner, runWithOwner} from 'solid-js';
import {Portal} from 'solid-js/web';
import OpeningHours from '../helpers/openingHours';
import {BusinessWorkHours, Timezone} from '../layer';
import Row from './row';
import I18n, {i18n} from '../lib/langPack';
import {getWeekDays, ONE_DAY_MINUTES, ONE_WEEK_MINUTES} from '../helpers/date';
import rotateArray from '../helpers/array/rotate';
import classNames from '../helpers/string/classNames';
import findUpAsChild from '../helpers/dom/findUpAsChild';
import ListenerSetter from '../helpers/listenerSetter';
import {copyTextToClipboard} from '../helpers/clipboard';
import {toastNew} from './toast';
import Animated from '../helpers/solid/animations';

export default function BusinessHours(props: {
  hours: () => BusinessWorkHours,
  timezones: () => Timezone[]
}) {
  const [expanded, setExpanded] = createSignal(false);
  const [is24x7, set24x7] = createSignal(false);
  const [lastKey, setLastKey] = createSignal<string>();
  const [element, setElement] = createSignal<JSX.Element>();
  const [showInMyTimezone, setShowInMyTimezone] = createSignal<boolean>();
  const [text, setText] = createSignal<string>();

  const listenerSetter = new ListenerSetter();
  onCleanup(() => listenerSetter.removeAll());

  const owner = getOwner();

  let switchElement: HTMLElement;
  const row = new Row({
    title: true,
    titleRight: (
      <span
        ref={switchElement}
        class={classNames('business-hours-switch-time', showInMyTimezone() === undefined && 'hide')}
      >
        {showInMyTimezone() !== undefined && i18n(showInMyTimezone() ? 'BusinessHoursProfileSwitchMy' : 'BusinessHoursProfileSwitchLocal')}
      </span>
    ) as HTMLElement,
    subtitleLangKey: 'BusinessHoursProfile',
    subtitleRight: true,
    icon: 'sending',
    clickable: (e) => {
      if(findUpAsChild(e.target as HTMLElement, switchElement)) {
        setShowInMyTimezone((value) => !value);
        runWithOwner(owner, () => {
          update();
        });
        setExpanded(true);
        return;
      }

      if(!is24x7()) {
        setExpanded((value) => !value);
      }
    },
    contextMenu: {
      buttons: [{
        icon: 'copy',
        text: 'Copy',
        onClick: () => {
          copyTextToClipboard(text());
          toastNew({langPackKey: 'BusinessHoursCopied'});
        }
      }]
    },
    listenerSetter
  });

  const updateContainerStyles = () => {
    let height: number;
    if(expanded() && !is24x7()) {
      const rect = row.container.querySelector('.business-hours').getBoundingClientRect();
      height = rect.height;
    }

    row.container.style.paddingBottom = height ? `${7 + 3 + height}px` : '';
    row.container.classList.toggle('is-expanded', expanded());
  };

  createEffect(on(
    expanded,
    updateContainerStyles,
    {defer: true}
  ));

  const getUtcOffset = () => {
    const workHours = props.hours();
    const timezonesList = props.timezones();
    const timezone = timezonesList?.find((timezone) => timezone.id === workHours.timezone_id);
    const date = new Date();
    const currentUtcOffset = -date.getTimezoneOffset();
    // const currentUtcOffset = -(-240);
    const valueUtcOffset = !timezone ? 0 : timezone.utc_offset / 60;
    const utcOffset = currentUtcOffset - valueUtcOffset;
    return utcOffset;
  };

  const update = () => {
    const workHours = props.hours();
    if(!workHours || !props.timezones()) {
      return;
    }

    const is24x7 = OpeningHours.is24x7(workHours);
    set24x7(is24x7);

    const weeklyOpen = workHours.weekly_open;

    const utcOffset = getUtcOffset();
    const isDifferentTimezone = !!utcOffset;
    const _showInMyTimezone = isDifferentTimezone ? untrack(showInMyTimezone) ?? false : true;
    const adaptedWeeklyOpen = OpeningHours.adaptWeeklyOpen(weeklyOpen, utcOffset);
    const {openNow, nowPeriodTime, nowWeekday} = OpeningHours.isOpenNow(adaptedWeeklyOpen);

    setShowInMyTimezone(isDifferentTimezone ? _showInMyTimezone : undefined);

    const formatDay = (day: Parameters<typeof OpeningHours['isFull']>[0], index: number) => {
      if(OpeningHours.isFull(day)) {
        return [I18n.format('BusinessHoursProfileOpen', true)];
      }

      if(!index && !openNow && !expanded()) {
        let opensPeriodTime = -1;
        for(let j = 0; j < adaptedWeeklyOpen.length; ++j) {
          const weekly = adaptedWeeklyOpen[j];
          if(nowPeriodTime < weekly.start_minute) {
            opensPeriodTime = weekly.start_minute;
            break;
          }
        }
        if(opensPeriodTime === -1 && adaptedWeeklyOpen.length) {
          opensPeriodTime = adaptedWeeklyOpen[0].start_minute;
        }
        if(opensPeriodTime === -1) {
          return [I18n.format('BusinessHoursProfileClose', true)];
        } else {
          const diff = opensPeriodTime < nowPeriodTime ? opensPeriodTime + (ONE_WEEK_MINUTES - nowPeriodTime) : opensPeriodTime - nowPeriodTime;
          if(diff < 60) {
            return [I18n.format('BusinessHoursProfileOpensInMinutes', true, [diff])];
          } else if(diff < ONE_DAY_MINUTES) {
            return [I18n.format('BusinessHoursProfileOpensInHours', true, [Math.ceil(diff / 60)])];
          } else {
            return [I18n.format('BusinessHoursProfileOpensInDays', true, [Math.ceil(diff / ONE_DAY_MINUTES)])];
          }
        }
      }

      const result = day.map((period) => period.toString());
      if(!result.length) {
        return [I18n.format('BusinessHoursProfileClose', true)];
      }

      return result;
    };

    const formatDays = (days: typeof localDays) => {
      return rotateArray(days, nowWeekday).map(formatDay);
    };

    const localDays = OpeningHours.getDaysHours(weeklyOpen);
    const localDaysFormatted = formatDays(localDays);

    const myDays = OpeningHours.getDaysHours(adaptedWeeklyOpen);
    const myDaysFormatted = formatDays(myDays);

    const daysFormattedToUse = _showInMyTimezone ? myDaysFormatted : localDaysFormatted;

    row.title.replaceChildren(i18n(openNow ? 'BusinessHoursProfileNowOpen' : 'BusinessHoursProfileNowClosed'));
    row.title.classList.toggle('green', openNow);
    row.title.classList.toggle('danger', !openNow);

    // console.log('weekly', {utcOffset, isDifferentTimezone, adaptedWeeklyOpen, workHours, localDays, myDays, localDaysFormatted, myDaysFormatted, showInMyTimezone, isOpen: openNow});

    row.subtitleRight.textContent = is24x7 ? I18n.format('BusinessHoursProfileFullOpen', true) : daysFormattedToUse[0][0];

    if(is24x7) {
      return;
    }

    const weekDays = rotateArray(getWeekDays(), nowWeekday);
    const key = daysFormattedToUse.map((day) => day.join('')).join('');
    if(untrack(lastKey) === key) {
      return;
    }

    const textLines: string[] = [];

    setLastKey(key);
    const rows = daysFormattedToUse.map((day, i) => {
      const weekDay = weekDays[i];

      let textLine = weekDay + ': ';
      const textPeriods: string[] = day;

      if(i === 0) {
        day = day.slice(1);
      }

      const ret = (<For each={day}>{(period, idx) => {
        return (
          <div class="business-hours-row">
            <div class="business-hours-row-day">{i !== 0 && idx() === 0 ? weekDay : ''}</div>
            <div class="business-hours-row-time">{period}</div>
          </div>
        );
      }}</For>);

      textLine += textPeriods.join(', ');
      textLines.push(textLine);

      return ret;
    });

    setText(rotateArray(textLines, -nowWeekday).join('\n'));

    setElement(
      <div class="business-hours">
        {rows}
      </div>
    );
  };

  createEffect(update);

  row.container.classList.add('business-hours-container');

  <Portal mount={row.container}>
    <Animated type="cross-fade">
      {element()}
    </Animated>
  </Portal>

  return row;
}
