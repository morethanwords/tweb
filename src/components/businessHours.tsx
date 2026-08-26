import {createMemo, createSignal, For, Show} from 'solid-js';
import OpeningHours from '@helpers/openingHours';
import {BusinessWorkHours, Timezone} from '@layer';
import RowTsx from '@components/rowTsx';
import I18n, {i18n} from '@lib/langPack';
import {getWeekDays, ONE_DAY_MINUTES, ONE_WEEK_MINUTES} from '@helpers/date';
import rotateArray from '@helpers/array/rotate';
import {copyTextToClipboard} from '@helpers/clipboard';
import {toastNew} from '@components/toast';
import Animated from '@helpers/solid/animations';
import {useResizeObserver} from '@hooks/useResizeObserver';

type BusinessHoursRow = {
  periods: string[],
  weekDay: string
};

export default function BusinessHours(props: {
  hours: () => BusinessWorkHours,
  timezones: () => Timezone[]
}) {
  const [expanded, setExpanded] = createSignal(false);
  const [showInMyTimezone, setShowInMyTimezone] = createSignal(false);
  const [detailsHeight, setDetailsHeight] = createSignal(0);
  const observeResize = useResizeObserver();

  const model = createMemo(() => {
    const workHours = props.hours();
    const timezones = props.timezones();
    if(!workHours || !timezones) {
      return;
    }

    const timezone = timezones.find((timezone) => timezone.id === workHours.timezone_id);
    const currentUtcOffset = -new Date().getTimezoneOffset();
    const valueUtcOffset = !timezone ? 0 : timezone.utc_offset / 60;
    const utcOffset = currentUtcOffset - valueUtcOffset;
    const isDifferentTimezone = !!utcOffset;
    const useMyTimezone = isDifferentTimezone ? showInMyTimezone() : true;
    const is24x7 = OpeningHours.is24x7(workHours);
    const weeklyOpen = workHours.weekly_open;
    const adaptedWeeklyOpen = OpeningHours.adaptWeeklyOpen(weeklyOpen, utcOffset);
    const {openNow, nowPeriodTime, nowWeekday} = OpeningHours.isOpenNow(adaptedWeeklyOpen);

    const formatDay = (day: Parameters<typeof OpeningHours.isFull>[0], index: number) => {
      if(OpeningHours.isFull(day)) {
        return [I18n.format('BusinessHoursProfileOpen', true)];
      }

      if(!index && !openNow && !expanded()) {
        let opensPeriodTime = -1;
        for(let i = 0; i < adaptedWeeklyOpen.length; ++i) {
          const weekly = adaptedWeeklyOpen[i];
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
        }

        const diff = opensPeriodTime < nowPeriodTime ?
          opensPeriodTime + (ONE_WEEK_MINUTES - nowPeriodTime) :
          opensPeriodTime - nowPeriodTime;
        if(diff < 60) {
          return [I18n.format('BusinessHoursProfileOpensInMinutes', true, [diff])];
        }
        if(diff < ONE_DAY_MINUTES) {
          return [I18n.format('BusinessHoursProfileOpensInHours', true, [Math.ceil(diff / 60)])];
        }
        return [I18n.format('BusinessHoursProfileOpensInDays', true, [Math.ceil(diff / ONE_DAY_MINUTES)])];
      }

      const result = day.map((period) => period.toString());
      return result.length ? result : [I18n.format('BusinessHoursProfileClose', true)];
    };

    const formatDays = (days: ReturnType<typeof OpeningHours.getDaysHours>) => {
      return rotateArray(days, nowWeekday).map(formatDay);
    };

    const localDays = formatDays(OpeningHours.getDaysHours(weeklyOpen));
    const myDays = formatDays(OpeningHours.getDaysHours(adaptedWeeklyOpen));
    const days = useMyTimezone ? myDays : localDays;
    const weekDays = rotateArray(getWeekDays(), nowWeekday);
    const rows: BusinessHoursRow[] = days.map((periods, index) => ({
      periods: index === 0 ? periods.slice(1) : periods,
      weekDay: weekDays[index]
    }));
    const text = rotateArray(days.map((periods, index) => (
      `${weekDays[index]}: ${periods.join(', ')}`
    )), -nowWeekday).join('\n');

    return {
      is24x7,
      isDifferentTimezone,
      openNow,
      rows,
      subtitleRight: is24x7 ? I18n.format('BusinessHoursProfileFullOpen', true) : days[0][0],
      text
    };
  });

  return (
    <RowTsx
      class="business-hours-container"
      classList={{'is-expanded': expanded()}}
      style={{
        'padding-bottom': expanded() && !model()?.is24x7 && detailsHeight() ?
          `${10 + detailsHeight()}px` :
          undefined
      }}
      clickable={() => {
        if(!model()?.is24x7) {
          setExpanded((value) => !value);
        }
      }}
      contextMenu={{
        buttons: [{
          icon: 'copy',
          text: 'Copy',
          onClick: () => {
            copyTextToClipboard(model()?.text || '');
            toastNew({langPackKey: 'BusinessHoursCopied'});
          }
        }]
      }}
    >
      <RowTsx.Icon icon="time_filled" />
      <RowTsx.Title
        class={model()?.openNow ? 'green' : 'danger'}
        titleRight={(
          <Show when={model()?.isDifferentTimezone}>
            <span
              class="business-hours-switch-time"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setShowInMyTimezone((value) => !value);
                setExpanded(true);
              }}
            >
              {i18n(showInMyTimezone() ? 'BusinessHoursProfileSwitchMy' : 'BusinessHoursProfileSwitchLocal')}
            </span>
          </Show>
        )}
      >
        {model() && i18n(model().openNow ? 'BusinessHoursProfileNowOpen' : 'BusinessHoursProfileNowClosed')}
      </RowTsx.Title>
      <RowTsx.Subtitle subtitleRight={model()?.subtitleRight}>
        {i18n('BusinessHoursProfile')}
      </RowTsx.Subtitle>
      <Animated type="cross-fade">
        <Show keyed when={!model()?.is24x7 && model()}>{(current) => (
          <div
            ref={(element) => {
              observeResize(element, ({size}) => setDetailsHeight(size.height));
            }}
            class="business-hours"
          >
            <For each={current.rows}>{({periods, weekDay}, dayIndex) => (
              <For each={periods}>{(period, periodIndex) => (
                <div class="business-hours-row">
                  <div class="business-hours-row-day">
                    {dayIndex() !== 0 && periodIndex() === 0 ? weekDay : ''}
                  </div>
                  <div class="business-hours-row-time">{period}</div>
                </div>
              )}</For>
            )}</For>
          </div>
        )}</Show>
      </Animated>
    </RowTsx>
  );
}
