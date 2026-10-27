import {createMemo, createSignal, onMount} from 'solid-js';
import {createStore, produce} from 'solid-js/store';
import {Portal} from 'solid-js/web';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import Row from '@components/rowTsx';
import SaveButton from '@components/saveButton';
import Section from '@components/section';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppBusinessHoursDayTab} from '@components/solidJsTabs/tabs';
import showTimePickerPopup, {formatPeriodTime} from '@components/popups/timePicker';
import {GrowHeightList, GrowHeightReveal} from '@helpers/solid/animations';
import useIsConfirmationNeededOnClose from '@hooks/useIsConfirmationNeededOnClose';
import {i18n} from '@lib/langPack';
import {ONE_DAY_MINUTES} from '@helpers/date';
import clamp from '@helpers/number/clamp';
import {BusinessPeriod, isFullDay, periodsEqual} from '@components/sidebarLeft/tabs/businessHoursShared';

type AppBusinessHoursDayTabType = typeof AppBusinessHoursDayTab;

const DEFAULT_OPEN = 8 * 60;
const DEFAULT_CLOSE = 20 * 60;

const fullDay = (): BusinessPeriod => ({start: 0, end: ONE_DAY_MINUTES - 1});

/**
 * One day of the business-hours schedule — Android's `OpeningHoursDayActivity`.
 * Edits stay here until Save hands them to the hours tab; leaving with unsaved
 * edits asks whether to save or discard them.
 */
const BusinessHoursDay = () => {
  const [tab] = useSuperTab<AppBusinessHoursDayTabType>();
  const {min, max, maxPeriodsCount} = tab.payload;

  const [periods, setPeriods] = createStore<BusinessPeriod[]>(
    tab.payload.periods.map((period) => ({...period}))
  );
  const [enabled, setEnabled] = createSignal(!!tab.payload.periods.length);

  // An "off" day keeps its periods until it is saved, so switching it back on
  // restores what the user had — as Android does.
  const result = (): BusinessPeriod[] => enabled() ?
    periods.map((period) => ({start: period.start, end: period.end})) :
    [];

  const hasChanges = createMemo(() => !periodsEqual(tab.payload.periods, result()));

  const save = () => {
    tab.payload.onSave(result());
    tab.isConfirmationNeededOnClose = undefined;
  };

  // Answering "Save" on the way out only saves: the slider closes the tab itself.
  tab.isConfirmationNeededOnClose = useIsConfirmationNeededOnClose({
    hasChanges,
    saveAllSettings: async() => save(),
    descriptionLangKey: 'UnsavedChangesDescription.BusinessHours'
  });

  // The header shows the weekday, which is a formatted date rather than a lang key,
  // so it cannot go through the scaffold's `title`.
  onMount(() => {
    tab.title.replaceChildren(tab.payload.dayName);
  });

  const is24 = createMemo(() => isFullDay(periods));

  const canAdd = createMemo(() => {
    if(periods.length >= maxPeriodsCount) return false;
    if(!periods.length || is24()) return true;
    return periods[periods.length - 1].end < Math.min(ONE_DAY_MINUTES - 2, max - 2);
  });

  // The hint hangs under whichever card comes last — the add button, or with no room
  // for another interval the last one listed — as on Android. A section holding the
  // caption alone would take the caption-only spacing instead.
  const infoCaption = (isLast: boolean) => isLast && !canAdd() ? 'BusinessHoursDayInfo' as const : undefined;

  const toggle = (value: boolean) => {
    setEnabled(value);
    if(value && !periods.length) { // a day switched on is open all day until told otherwise
      setPeriods([fullDay()]);
    }
  };

  const add = () => {
    setPeriods(produce((list) => {
      if(!list.length || isFullDay(list)) {
        list.length = 0;
        const start = clamp(DEFAULT_OPEN, min, max - 1);
        list.push({start, end: clamp(DEFAULT_CLOSE, start + 1, max)});
        return;
      }

      const lastEnd = list[list.length - 1].end;
      const start = clamp(lastEnd + 30, min, max - 1);
      list.push({start, end: clamp(Math.floor((lastEnd + 26 * 60) / 2), start + 1, max)});
    }));
  };

  const remove = (index: number) => {
    setPeriods(produce((list) => {
      list.splice(index, 1);
      if(!list.length) { // an empty enabled day means "open all day", not "closed"
        list.push(fullDay());
      }
    }));
  };

  const pickTime = (index: number, edge: 'start' | 'end') => {
    const period = periods[index];
    const previous = index > 0 ? periods[index - 1] : undefined;
    const next = index + 1 < periods.length ? periods[index + 1] : undefined;

    showTimePickerPopup({
      titleLangKey: edge === 'start' ? 'BusinessHoursDayOpenHourPicker' : 'BusinessHoursDayCloseHourPicker',
      value: period[edge],
      min: edge === 'start' ? (previous ? previous.end + 1 : min) : period.start + 1,
      max: edge === 'start' ? period.end - 1 : (next ? next.start - 1 : max),
      onPick: (value) => setPeriods(index, edge, value)
    });
  };

  return (
    <>
      <Portal mount={tab.header}>
        <SaveButton
          hasChanges={hasChanges()}
          onClick={() => {
            save();
            tab.close();
          }}
        />
      </Portal>

      <Section caption={infoCaption(enabled() && is24())}>
        <Row>
          <Row.CheckboxFieldToggle>
            <CheckboxFieldTsx checked={enabled()} toggle onChange={toggle} />
          </Row.CheckboxFieldToggle>
          <Row.Title>{i18n('BusinessHoursDayOpen')}</Row.Title>
        </Row>
      </Section>

      <GrowHeightReveal when={enabled()} appear={false}>
        {/* "Open 24 hours" is the day with no intervals listed */}
        <GrowHeightList each={is24() ? [] : periods}>{(period, index) => (
          <Section caption={infoCaption(index() === periods.length - 1)}>
            <Row clickable={() => pickTime(index(), 'start')}>
              <Row.Title titleRight={formatPeriodTime(period.start)} titleRightSecondary>
                {i18n('BusinessHoursDayOpenHour')}
              </Row.Title>
            </Row>
            <Row clickable={() => pickTime(index(), 'end')}>
              <Row.Title titleRight={formatPeriodTime(period.end)} titleRightSecondary>
                {i18n('BusinessHoursDayCloseHour')}
              </Row.Title>
            </Row>
            <Row color="danger" clickable={() => remove(index())}>
              <Row.Title class="danger">{i18n('Remove')}</Row.Title>
            </Row>
          </Section>
        )}</GrowHeightList>

        <GrowHeightReveal when={canAdd()} appear={false}>
          <Section caption="BusinessHoursDayInfo">
            <Row clickable={add}>
              <Row.Icon icon="add" />
              <Row.Title class="primary">{i18n('BusinessHoursDayAdd')}</Row.Title>
            </Row>
          </Section>
        </GrowHeightReveal>
      </GrowHeightReveal>
    </>
  );
};

export default BusinessHoursDay;
