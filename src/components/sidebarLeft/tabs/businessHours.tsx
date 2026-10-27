import {createMemo, createResource, createSignal, For, Show} from 'solid-js';
import {createStore, produce, unwrap} from 'solid-js/store';
import {Portal} from 'solid-js/web';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import MediaHeader from '@components/mediaHeader';
import Row from '@components/rowTsx';
import SaveButton from '@components/saveButton';
import Section from '@components/section';
import {toastNew} from '@components/toast';
import {type AppBusinessHoursTab} from '@components/solidJsTabs/tabs';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {getWeekDays, ONE_DAY_MINUTES} from '@helpers/date';
import {GrowHeightReveal} from '@helpers/solid/animations';
import OpeningHours from '@helpers/openingHours';
import {getSystemTimezoneId, getTimezoneName} from '@helpers/timezones';
import useIsConfirmationNeededOnClose from '@hooks/useIsConfirmationNeededOnClose';
import {BusinessWorkHours, Timezone, UserFull} from '@layer';
import {i18n} from '@lib/langPack';
import type {PreloadedLottieAsset} from '@lib/lottie/lottieLoader';
import {
  BusinessDays,
  businessDaysEqual,
  copyBusinessDays,
  formatDayPeriods
} from '@components/sidebarLeft/tabs/businessHoursShared';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

type AppBusinessHoursTabType = typeof AppBusinessHoursTab;

export type BusinessHoursTabPayload = {
  animationData: PreloadedLottieAsset,
  userFull: MaybePromise<UserFull.userFull>,
  timezones: MaybePromise<Timezone[]>
};

/** Server-side cap on how many open intervals the whole week may hold. */
const PERIODS_COUNT_LIMIT = 28;

/** Mon–Fri open all day — what Android seeds an account with no hours yet. */
const defaultDays = (): BusinessDays => Array.from({length: 7}, (_, day) => (
  day < 5 ? [{start: 0, end: ONE_DAY_MINUTES - 1}] : []
));

const BusinessHoursTab = () => {
  const [tab] = useSuperTab<AppBusinessHoursTabType>();
  const promiseCollector = usePromiseCollector();

  const loadPromise = Promise.all([
    Promise.resolve(tab.payload.userFull),
    Promise.resolve(tab.payload.timezones)
  ]).then(([userFull, timezones]) => ({
    workHours: userFull?.business_work_hours as BusinessWorkHours.businessWorkHours,
    timezones: timezones || []
  }));
  promiseCollector.collect(loadPromise);

  const [data] = createResource(() => loadPromise);

  // Outside the form, which waits for the data: rendered now, the sticker is one
  // of the things the tab waits for before it slides in.
  return (
    <>
      <MediaHeader marginBottom>
        <MediaHeader.Sticker animationData={tab.payload.animationData} size={130} restartOnClick={false} />
        <MediaHeader.Title>{i18n('BusinessHours')}</MediaHeader.Title>
        <MediaHeader.Subtitle>{i18n('BusinessHoursInfo')}</MediaHeader.Subtitle>
      </MediaHeader>
      <Show when={data()}>
        <BusinessHoursForm workHours={data().workHours} timezones={data().timezones} />
      </Show>
    </>
  );
};

export default BusinessHoursTab;

const BusinessHoursForm = (props: {
  workHours: BusinessWorkHours.businessWorkHours,
  timezones: Timezone[]
}) => {
  const [tab] = useSuperTab<AppBusinessHoursTabType>();

  // The saved schedule, kept for the "has changes" comparison. `undefined` means
  // the account shows no business hours at all.
  const savedDays = props.workHours ?
    copyBusinessDays(OpeningHours.getDaysHours(props.workHours.weekly_open)) :
    undefined;
  const savedTimezoneId = props.workHours?.timezone_id || getSystemTimezoneId(props.timezones);

  const [enabled, setEnabled] = createSignal(!!props.workHours);
  const [timezoneId, setTimezoneId] = createSignal(savedTimezoneId);
  const [days, setDays] = createStore<BusinessDays>(
    savedDays ? copyBusinessDays(savedDays) : defaultDays()
  );
  const [saving, setSaving] = createSignal(false);

  const weekDays = getWeekDays();

  // the store itself, not `unwrap(days)`: reading through it is what makes a day's edit count
  const hasChanges = createMemo(() => {
    if(!!savedDays !== enabled()) return true;
    if(savedTimezoneId !== timezoneId()) return true;
    return !!savedDays && enabled() && !businessDaysEqual(savedDays, days);
  });

  /**
   * How many more intervals this day may take. Every other day keeps at least one
   * slot free so it can still be switched to "open 24 hours" — same as Android.
   */
  const maxPeriodsFor = () => PERIODS_COUNT_LIMIT - days.reduce((sum, periods) => (
    sum + Math.max(1, periods.length)
  ), 0);

  /**
   * A day that runs past midnight cannot overlap the next day's own opening, so
   * once `day` has hours the previous day's overflow is cut back to midnight.
   */
  const adaptPrevDay = (day: number) => {
    if(!days[day].length) return;

    const prevDay = (7 + day - 1) % 7;
    setDays(produce((all) => {
      const periods = all[prevDay];
      const last = periods[periods.length - 1];
      if(!last || last.end <= ONE_DAY_MINUTES - 1) return;

      last.end = ONE_DAY_MINUTES - 1;
      if(last.start >= last.end) periods.pop();
    }));
  };

  const toggleDay = (day: number, open: boolean) => {
    setDays(day, open ? [{start: 0, end: ONE_DAY_MINUTES - 1}] : []);
    if(open) adaptPrevDay(day);
  };

  const openDay = (day: number) => {
    const prevDay = (7 + day - 1) % 7;
    const prevDayMaxTime = days[prevDay].reduce((max, period) => Math.max(max, period.end), 0);
    const nextDay = (day + 1) % 7;
    const nextDayMinTime = days[nextDay].reduce((min, period) => Math.min(min, period.start), ONE_DAY_MINUTES);

    tab.slider.createTab(hotReloadGuard.tabs.AppBusinessHoursDayTab).open({
      dayName: weekDays[day],
      periods: unwrap(days[day]).map((period) => ({...period})),
      min: Math.max(0, prevDayMaxTime + 1 - ONE_DAY_MINUTES),
      max: ONE_DAY_MINUTES + nextDayMinTime - 1,
      maxPeriodsCount: maxPeriodsFor(),
      onSave: (periods) => {
        setDays(day, periods);
        adaptPrevDay(day);
      }
    });
  };

  const openTimezones = () => {
    tab.slider.createTab(hotReloadGuard.tabs.AppTimezoneTab).open({
      timezones: props.timezones,
      selected: timezoneId(),
      onSelect: setTimezoneId
    });
  };

  /**
   * Resolves to whether the hours were saved. The header button closes the tab once
   * they are; the "unsaved changes" popup does not, since the slider is already
   * closing the tab — closing it here as well would close the tab beneath it too.
   */
  const save = async(close: boolean) => {
    if(saving()) return false;
    setSaving(true);

    const weeklyOpen = OpeningHours.fromDaysHours(unwrap(days));
    const workHours: BusinessWorkHours.businessWorkHours = enabled() && weeklyOpen.length ? {
      _: 'businessWorkHours',
      pFlags: {},
      timezone_id: timezoneId(),
      weekly_open: weeklyOpen
    } : undefined;

    try {
      await tab.managers.appBusinessManager.updateBusinessWorkHours(workHours);
      tab.isConfirmationNeededOnClose = undefined;
      if(close) tab.close();
      return true;
    } catch(err) {
      console.error('updateBusinessWorkHours error:', err);
      toastNew({langPackKey: 'Error.AnError'});
      return false;
    } finally {
      setSaving(false);
    }
  };

  tab.isConfirmationNeededOnClose = useIsConfirmationNeededOnClose({
    hasChanges,
    // a failed save keeps the tab open, changes and all
    saveAllSettings: async() => {
      if(!await save(false)) throw new Error('BUSINESS_HOURS_NOT_SAVED');
    },
    descriptionLangKey: 'UnsavedChangesDescription.BusinessHours',
    waitForSave: true
  });

  return (
    <>
      <Portal mount={tab.header}>
        <SaveButton hasChanges={hasChanges() && !saving()} onClick={() => save(true)} />
      </Portal>

      <Section>
        <Row>
          <Row.CheckboxFieldToggle>
            <CheckboxFieldTsx checked={enabled()} toggle onChange={setEnabled} />
          </Row.CheckboxFieldToggle>
          <Row.Title>{i18n('BusinessHoursShow')}</Row.Title>
        </Row>
      </Section>

      <GrowHeightReveal when={enabled()} appear={false}>
        <Section name="BusinessHours">
          <For each={days}>{(periods, day) => (
            <Row clickable={() => openDay(day())}>
              <Row.Title>{weekDays[day()]}</Row.Title>
              <Row.Subtitle>{formatDayPeriods(periods)}</Row.Subtitle>
              <Row.RightContent onClick={(e) => e.stopPropagation()}>
                <CheckboxFieldTsx
                  checked={!!periods.length}
                  toggle
                  onChange={(checked) => toggleDay(day(), checked)}
                />
              </Row.RightContent>
            </Row>
          )}</For>
        </Section>

        <Section>
          <Row clickable={openTimezones}>
            <Row.Title
              titleRight={getTimezoneName(props.timezones, timezoneId())}
              titleRightSecondary
            >
              {i18n('BusinessHoursTimezone')}
            </Row.Title>
          </Row>
        </Section>
      </GrowHeightReveal>
    </>
  );
};
