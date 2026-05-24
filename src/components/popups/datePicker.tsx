import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {batch, createEffect, createMemo, createSignal, For, JSX, onCleanup, onMount, Show} from 'solid-js';
import classNames from '@helpers/string/classNames';
import mediaSizes from '@helpers/mediaSizes';
import I18n, {i18n, LangPackKey, FormatterArguments} from '@lib/langPack';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import InputField from '@components/inputField';
import rootScope from '@lib/rootScope';
import ListenerSetter from '@helpers/listenerSetter';
import {formatTime} from '@helpers/date';
import suggestPostStyles from '@components/chat/suggestPostPopup/styles.module.scss';
import {wrapReplyMedia} from '@components/chat/replyContainer';
import createMiddleware from '@helpers/solid/createMiddleware';
import {Message, MessagesFilter} from '@layer';
import {ScrollableContextValue} from '@components/scrollable2';

const MILLIS_IN_MINUTE = 60 * 1000;

// Layout constants — keep in sync with _datePicker.scss
// CSS uses --date-picker-cell: 2.5rem and html font-size: 16px ⇒ 40px.
// Grid row-gap: 0.25rem ⇒ 4px (only between cell rows; not above first row).
const CELL_HEIGHT = 40;
const MONTH_LABEL_HEIGHT = 40;
const WEEKDAY_HEIGHT = 40;
const ROW_GAP = 4;
const SCROLL_BUFFER_PX = 200; // extra rows rendered above/below viewport for smooth scrolling

const getMaxScheduleDate = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  date.setDate(date.getDate() - 1);
  return date;
};

const checkDate = (date: Date, addMinutes?: number) => {
  const ret = date.getTime() > getMaxScheduleDate().getTime() ? new Date() : date;
  if(addMinutes) {
    ret.setMinutes(ret.getMinutes() + addMinutes);
  }
  return ret;
};

const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const dayKeyFromTimestamp = (ts: number) => {
  const d = new Date(ts);
  return dayKey(d);
};

// Weekend days for the user's locale, mapped to JS Date.getDay() convention
// (0=Sun ... 6=Sat). Uses the Intl.Locale weekInfo extension when available
// (Chrome 130+, Safari 17+, Firefox 124+) so locales like he-IL get Fri+Sat.
let weekendDaysCache: Set<number> | undefined;
function getWeekendDays(): Set<number> {
  if(weekendDaysCache) return weekendDaysCache;
  try {
    const langCode = I18n.getLastRequestedLangCode?.() || 'en';
    const locale = new Intl.Locale(langCode) as Intl.Locale & {
      weekInfo?: {weekend: number[]},
      getWeekInfo?: () => {weekend: number[]}
    };
    const info = typeof locale.getWeekInfo === 'function' ? locale.getWeekInfo() : locale.weekInfo;
    if(info && Array.isArray(info.weekend)) {
      // Intl spec: 1=Mon ... 7=Sun. Map to JS getDay(): 7→0 (Sunday), others unchanged.
      weekendDaysCache = new Set(info.weekend.map((d) => d % 7));
      return weekendDaysCache;
    }
  } catch{}
  weekendDaysCache = new Set([0, 6]);
  return weekendDaysCache;
}
const isWeekend = (date: Date) => getWeekendDays().has(date.getDay());

export type DatePickerPopupOptions = {
  initDate: Date,
  onPick: (timestamp: number) => void,
  minDate?: Date,
  maxDate?: Date,
  withTime?: boolean,
  addMinutes?: boolean,
  btnConfirmLangKey?: LangPackKey,
  btnDangerLangKey?: LangPackKey,
  // suggest-post extra
  minTimeDate?: Date,
  // Slot for caller-provided extras inside the popup body, rendered AFTER the
  // calendar scrollable. Used by feature-specific wrappers (e.g. the schedule
  // sending popup adds a "Repeat" row here). Kept as a thunk so the JSX is
  // evaluated lazily inside the popup's Solid context.
  bodyAfter?: () => JSX.Element,
  // Slot for caller-provided extra footer buttons, rendered AFTER the primary
  // confirm button (e.g. "Send when online" secondary button).
  footerAfter?: () => JSX.Element,
  // — port: per-day media thumbnails (jump-to-date in chat) —
  peerId?: PeerId,
  threadId?: number,
  mediaFilter?: MessagesFilter['_'],
  // — port: multi-date (range) selection mode —
  // `multiSelect` makes the popup OPEN already in range-pick mode.
  // `canMultiSelect` shows the toggle button in the header (auto-on if onPickRange is set).
  multiSelect?: boolean,
  canMultiSelect?: boolean,
  onPickRange?: (fromTimestamp: number, toTimestamp: number) => void,
  // Override the primary footer button while multi-select is active. Lets a
  // caller (e.g. jump-to-date in chat) replace the default "Jump to Date"
  // primary action with a danger one like "Clear History" without leaking
  // any of that domain logic into the picker itself.
  multiSelectAction?: {
    langKey: LangPackKey,
    isDanger?: boolean,
    // `to` defaults to `from` when only the start endpoint has been picked.
    // Return value is forwarded to the footer button: a Promise pends the
    // button (disabled while awaiting); a literal `false` keeps the popup open
    // without hiding it on rejection.
    callback: (fromTimestamp: number, toTimestamp: number) => unknown
  }
};

export const DATE_PICKER_POPUP_KIND = Symbol('date-picker-popup');

// A grid cell is either a real day or an alignment spacer.
type CellModel =
  | {kind: 'day', date: Date, timestamp: number, disabled: boolean}
  | {kind: 'spacer', key: string};

type MonthSection = {
  date: Date,             // first day of the month, time stripped
  key: string,
  cells: CellModel[],
  rows: number,
  height: number,
  offset: number
};

export default function showDatePickerPopup(opts: DatePickerPopupOptions): void {
  const minDate = opts.minDate || new Date('2013-08-01T00:00:00');
  minDate.setHours(0, 0, 0, 0);

  const maxDate = opts.maxDate || (opts.withTime ? getMaxScheduleDate() : new Date());
  maxDate.setHours(0, 0, 0, 0);

  const initDate = checkDate(opts.initDate, opts.addMinutes ? 10 : undefined);
  if(initDate < minDate) {
    initDate.setFullYear(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
  }

  const initHours = initDate.getHours();
  const initMinutes = initDate.getMinutes();
  initDate.setHours(0, 0, 0, 0);

  function Inner() {
    const listenerSetter = new ListenerSetter();

    const [selectedDate, setSelectedDate] = createSignal<Date>(initDate);
    const [selectionStart, setSelectionStart] = createSignal<Date | null>(null);
    const [selectionEnd, setSelectionEnd] = createSignal<Date | null>(null);

    // Runtime multi-select state. `multiSelect` opens the popup already in
    // range mode. The toggle button is opt-in per-callsite via either
    // `canMultiSelect: true` or by providing an `onPickRange` callback.
    const [multiSelectActive, setMultiSelectActive] = createSignal(!!opts.multiSelect);
    const showMultiSelectToggle = !!(opts.canMultiSelect || opts.onPickRange || opts.multiSelectAction);

    function toggleMultiSelect() {
      batch(() => {
        const next = !multiSelectActive();
        setMultiSelectActive(next);
        // Clear any range / pick when toggling so the new mode starts fresh.
        setSelectionStart(null);
        setSelectionEnd(null);
      });
    }
    const [hoursValue, setHoursValue] = createSignal(('0' + initHours).slice(-2));
    const [minutesValue, setMinutesValue] = createSignal(('0' + initMinutes).slice(-2));

    // Scroll state — fed from PopupElement.Scrollable's onScroll callback
    const [scrollTop, setScrollTop] = createSignal(0);
    const [viewportHeight, setViewportHeight] = createSignal(0);

    // Per-day media cache (filled lazily as months scroll into view).
    // Stores the most recent media-bearing message of each day; the cell
    // renderer hands the whole message to wrapReplyMedia so photos, videos,
    // gifs, stickers and round videos all draw correctly.
    const [mediaByDay, setMediaByDay] = createSignal<Map<string, Message.message>>(new Map());
    const requestedMonths = new Set<string>();

    let scrollableContextRef: ScrollableContextValueOrUndefined;
    let scrollableHostRef: HTMLDivElement | undefined;
    let didInitialScroll = false;

    const minMonth = new Date(minDate);
    minMonth.setDate(1);
    minMonth.setHours(0, 0, 0, 0);

    const maxMonth = new Date(maxDate);
    maxMonth.setDate(1);
    maxMonth.setHours(0, 0, 0, 0);

    // Time inputs (kept imperative — InputField is a legacy DOM construction helper)
    let hoursInputField: InputField;
    let minutesInputField: InputField;
    if(opts.withTime) {
      hoursInputField = new InputField({plainText: true});
      minutesInputField = new InputField({plainText: true});
      hoursInputField.setValueSilently(hoursValue());
      minutesInputField.setValueSilently(minutesValue());

      const handleTimeInput = (
        max: number,
        inputField: InputField,
        setStateValue: (v: string) => void,
        onInput: (length: number) => void,
        onOverflow?: (number: number) => void
      ) => {
        const maxString = '' + max;
        listenerSetter.add(inputField.input)('input', () => {
          let value = inputField.value.replace(/\D/g, '');
          if(value.length > 2) {
            value = value.slice(0, 2);
          } else {
            if((value.length === 1 && +value[0] > +maxString[0]) || (value.length === 2 && +value > max)) {
              if(value.length === 2 && onOverflow) {
                onOverflow(+value[1]);
              }
              value = '0' + value[0];
            }
          }
          inputField.setValueSilently(value);
          setStateValue(value);
          onInput(value.length);
        });
      };

      handleTimeInput(23, hoursInputField, setHoursValue, (length) => {
        if(length === 2) minutesInputField.input.focus();
      }, (number) => {
        const next = (number + minutesInputField.value).slice(0, 2);
        minutesInputField.setValueSilently(next);
        setMinutesValue(next);
      });
      handleTimeInput(59, minutesInputField, setMinutesValue, (length) => {
        if(!length) hoursInputField.input.focus();
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Build the chronological list of month sections (oldest → newest).
    // Heights are pre-computed so we can virtualize without a layout pass.
    // ─────────────────────────────────────────────────────────────────────────
    const monthSections: MonthSection[] = (() => {
      const list: MonthSection[] = [];
      const cursor = new Date(minMonth);
      let runningOffset = 0;

      while(cursor <= maxMonth) {
        const cells = buildMonthCells(cursor);
        const rows = Math.ceil(cells.length / 7);
        // row-gap only sits BETWEEN rows in the grid (not above the first row),
        // so for `rows` rows we add `rows - 1` gaps.
        const height =
          MONTH_LABEL_HEIGHT +
          WEEKDAY_HEIGHT +
          rows * CELL_HEIGHT +
          Math.max(0, rows - 1) * ROW_GAP;
        list.push({
          date: new Date(cursor),
          key: monthKey(cursor),
          cells,
          rows,
          height,
          offset: runningOffset
        });
        runningOffset += height;
        cursor.setMonth(cursor.getMonth() + 1);
      }

      return list;
    })();

    // Each month is a self-contained block: only its own days, with blank
    // spacer cells filling the gaps before the 1st and after the last day.
    function buildMonthCells(month: Date): CellModel[] {
      const cells: CellModel[] = [];
      const firstDate = new Date(month);
      firstDate.setHours(0, 0, 0, 0);
      const monthKeyStr = monthKey(firstDate);

      // Leading padding (Mon-first week). Sunday=0 ⇒ 6 leading; Mon=1 ⇒ 0; etc.
      let leading = firstDate.getDay() - 1;
      if(leading === -1) leading = 6;

      for(let i = 0; i < leading; ++i) {
        cells.push({kind: 'spacer', key: `${monthKeyStr}-pre-${i}`});
      }

      // Days of the month.
      const dayCursor = new Date(firstDate);
      do {
        cells.push({
          kind: 'day',
          date: new Date(dayCursor),
          timestamp: dayCursor.getTime(),
          disabled: dayCursor < minDate || dayCursor > maxDate
        });
        dayCursor.setDate(dayCursor.getDate() + 1);
      } while(dayCursor.getDate() !== 1);

      // Trailing padding to complete the final week row.
      const remainder = cells.length % 7;
      if(remainder) {
        for(let i = remainder; i < 7; ++i) {
          cells.push({kind: 'spacer', key: `${monthKeyStr}-post-${i}`});
        }
      }

      return cells;
    }

    const totalHeight = monthSections.length ?
      monthSections[monthSections.length - 1].offset + monthSections[monthSections.length - 1].height :
      0;

    const initialMonthIndex = Math.max(
      0,
      monthSections.findIndex((m) => m.key === monthKey(initDate))
    );

    // Visible window (for virtualization).
    const visibleSections = createMemo(() => {
      const top = scrollTop();
      const bottom = top + Math.max(viewportHeight(), CELL_HEIGHT * 6);
      const result: MonthSection[] = [];
      for(const section of monthSections) {
        const sectionBottom = section.offset + section.height;
        if(sectionBottom < top - SCROLL_BUFFER_PX) continue;
        if(section.offset > bottom + SCROLL_BUFFER_PX) break;
        result.push(section);
      }
      return result;
    });

    // The "currently focused" month — drives the popup title and the up/down
    // arrow targets. We match the section whose vertical span contains the
    // VIEWPORT CENTER (same heuristic tdesktop's CalendarBox uses).
    //
    // Using the viewport's TOP edge (offset + height > scrollTop + 1) breaks
    // at the bottom of the scroll: when the initial month is the last one, the
    // browser clamps scrollTop to (scrollHeight − clientHeight), which lands
    // INSIDE the second-to-last month — so the title would show that month and
    // the up arrow would skip ahead by two.
    const topMostSection = createMemo<MonthSection>(() => {
      if(!monthSections.length) return undefined;
      const top = scrollTop();
      const vh = viewportHeight();
      // Fall back to top-of-viewport while we don't have a measured height yet.
      const probe = vh > 0 ? top + vh / 2 : top + 1;
      for(const m of monthSections) {
        if(m.offset + m.height > probe) return m;
      }
      return monthSections[monthSections.length - 1];
    });

    // ─── visible-month index helpers for the up/down arrows ────────────────
    const isPrevDisabled = createMemo(() => {
      const top = topMostSection();
      return !top || top.key === monthSections[0]?.key;
    });
    const isNextDisabled = createMemo(() => {
      const top = topMostSection();
      return !top || top.key === monthSections[monthSections.length - 1]?.key;
    });

    function scrollToSection(section: MonthSection, smooth = true) {
      if(!scrollableHostRef) return;
      // Use the host element directly — Scrollable's setScrollPositionSilently
      // would suppress the scroll event we need to update reactive state.
      scrollableHostRef.scrollTo({
        top: section.offset,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }

    function onPrev() {
      const top = topMostSection();
      if(!top) return;
      const idx = monthSections.indexOf(top);
      if(idx > 0) scrollToSection(monthSections[idx - 1]);
    }

    function onNext() {
      const top = topMostSection();
      if(!top) return;
      const idx = monthSections.indexOf(top);
      if(idx < monthSections.length - 1) scrollToSection(monthSections[idx + 1]);
    }

    async function fetchMonthMedia(section: MonthSection) {
      if(!opts.peerId) return;
      if(requestedMonths.has(section.key)) return;

      requestedMonths.add(section.key);

      // Last day of the section's month (server returns messages ≤ offset_date).
      const lastDay = new Date(section.date);
      lastDay.setMonth(lastDay.getMonth() + 1);
      lastDay.setDate(0);
      lastDay.setHours(23, 59, 59, 999);

      try {
        const result = await rootScope.managers.appMessagesManager.getSearchResultsCalendar({
          peerId: opts.peerId,
          threadId: opts.threadId,
          filter: {_: opts.mediaFilter || 'inputMessagesFilterPhotoVideo'} as MessagesFilter,
          offsetDate: Math.floor(lastDay.getTime() / 1000)
        });

        if(!result.messages?.length) return;

        const next = new Map(mediaByDay());
        let added = 0;

        for(const message of result.messages) {
          if(message._ !== 'message') continue;
          if(!message.media) continue;

          const key = dayKeyFromTimestamp(message.date * 1000);
          if(!next.has(key)) {
            next.set(key, message);
            ++added;
          }
        }

        if(added) setMediaByDay(next);
      } catch(err) {
        // Swallow — the calendar still works without thumbnails.
        // Re-mark as not-requested so a later visit may retry.
        requestedMonths.delete(section.key);
      }
    }

    // Kick off media fetches for any visible section we haven't requested yet.
    createEffect(() => {
      if(!opts.peerId) return;
      const sections = visibleSections();
      for(const section of sections) {
        if(!requestedMonths.has(section.key)) {
          fetchMonthMedia(section);
        }
      }
    });

    // ─── selected day count (multi-select only) ───────────────────────────
    const selectedDayCount = createMemo<number>(() => {
      const start = selectionStart();
      if(!start) return 0;
      const end = selectionEnd();
      if(!end) return 1;
      const ms = end.getTime() - start.getTime();
      return Math.round(ms / (24 * 60 * 60 * 1000)) + 1;
    });

    // ─── title (month name, or "N days selected" when multi-select active) ─
    const monthTitleEl = createMemo<JSX.Element>(() => {
      if(multiSelectActive() && selectedDayCount() > 0) {
        return i18n('Calendar.SelectedDays', [selectedDayCount()]);
      }
      const section = topMostSection();
      const date = section ? section.date : initDate;
      return new I18n.IntlDateElement({
        date,
        options: {
          year: 'numeric',
          month: opts.withTime && mediaSizes.isMobile ? 'short' : 'long'
        }
      }).element;
    });

    // ─── weekday names ─────────────────────────────────────────────────────
    // Resolved as plain strings so the same names can be inserted into every
    // month section. (HTMLElement nodes can only live in ONE place in the DOM,
    // so reusing IntlDateElement-created nodes would leave all but the last
    // section's weekday row visually empty.)
    const weekdayInfo: Array<{name: string, weekend: boolean}> = (() => {
      const cursor = new Date();
      const day = cursor.getDay();
      if(day !== 1) cursor.setHours(-24 * (day - 1));
      const out: Array<{name: string, weekend: boolean}> = [];
      for(let i = 0; i < 7; ++i) {
        out.push({
          name: new I18n.IntlDateElement({date: cursor, options: {weekday: 'narrow'}}).element.textContent,
          weekend: isWeekend(cursor)
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      return out;
    })();

    // ─── confirm label / disabled state ────────────────────────────────────
    // Color of the primary footer button — danger only when a multi-select
    // action explicitly opts into it (e.g. Clear History in chat).
    const confirmColor = createMemo<'primary' | 'danger'>(() => {
      if(multiSelectActive() && opts.multiSelectAction?.isDanger) return 'danger';
      return 'primary';
    });

    const confirmLabel = createMemo<JSX.Element>(() => {
      if(multiSelectActive() && opts.multiSelectAction) {
        return i18n(opts.multiSelectAction.langKey);
      }
      if(opts.btnConfirmLangKey) return i18n(opts.btnConfirmLangKey);
      if(multiSelectActive() && selectedDayCount() > 0) {
        return i18n('Calendar.SelectedDays', [selectedDayCount()]);
      }
      if(!opts.withTime) return i18n('JumpToDate');

      let key: LangPackKey;
      const args: FormatterArguments = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sendDate = new Date(selectedDate().getTime());
      sendDate.setHours(+hoursValue() || 0, +minutesValue() || 0);

      if(selectedDate().getTime() === today.getTime()) {
        key = 'Schedule.SendToday';
      } else {
        key = 'Schedule.SendDate';
        const dateOptions: Intl.DateTimeFormatOptions = {month: 'short', day: 'numeric'};
        if(sendDate.getFullYear() !== today.getFullYear()) {
          dateOptions.year = 'numeric';
        }
        args.push(new I18n.IntlDateElement({date: sendDate, options: dateOptions}).element);
      }

      args.push(new I18n.IntlDateElement({
        date: sendDate,
        options: {minute: '2-digit', hour: '2-digit'}
      }).element);

      return i18n(key, args);
    });

    const isConfirmDisabled = createMemo(() => {
      if(multiSelectActive()) {
        // multiSelectAction enables the button as soon as one day is picked
        // (single-day range = same day for both endpoints). onPickRange wants
        // an explicit two-endpoint range. With neither, fall back to single
        // pick — also enabled with one click.
        if(opts.onPickRange) {
          return !selectionStart() || !selectionEnd();
        }
        return !selectionStart();
      }
      if(!opts.minTimeDate) return false;
      const sendDate = new Date(selectedDate().getTime());
      sendDate.setHours(+hoursValue() || 0, +minutesValue() || 0);
      return sendDate < new Date() ||
        (sendDate.valueOf() / MILLIS_IN_MINUTE | 0) < (opts.minTimeDate.valueOf() / MILLIS_IN_MINUTE | 0);
    });

    const isMinTimeCaptionVisible = createMemo(() => {
      if(!opts.minTimeDate) return true;
      const sendDate = new Date(selectedDate().getTime());
      sendDate.setHours(+hoursValue() || 0, +minutesValue() || 0);
      return sendDate.getDate() === opts.minTimeDate.getDate();
    });

    // ─── cell click handling ───────────────────────────────────────────────
    function onCellClick(cell: CellModel) {
      if(cell.kind !== 'day') return;
      if(cell.disabled) return;

      if(multiSelectActive()) {
        batch(() => {
          const start = selectionStart();
          const end = selectionEnd();
          if(!start || (start && end)) {
            // First click, or third click after a complete pair → start a new range.
            setSelectionStart(cell.date);
            setSelectionEnd(null);
          } else {
            // Second click → close the range. Swap if user picked an earlier date.
            if(cell.date < start) {
              setSelectionStart(cell.date);
              setSelectionEnd(start);
            } else {
              setSelectionEnd(cell.date);
            }
          }
          setSelectedDate(cell.date);
        });
        return;
      }

      setSelectedDate(cell.date);
    }

    async function onConfirm() {
      if(multiSelectActive()) {
        const start = selectionStart();
        if(!start) return;

        // multiSelectAction takes priority: lets a caller fully replace the
        // primary action while in multi-select (Clear History in chat, etc.).
        // Single-day pick is treated as a 1-day range (to defaults to start).
        if(opts.multiSelectAction) {
          const end = selectionEnd() || start;
          const from = new Date(start);
          from.setHours(0, 0, 0, 0);
          const to = new Date(end);
          to.setHours(23, 59, 59, 999);
          // Awaited so the footer button stays disabled while the (potentially
          // async) action runs. The return value is intentionally discarded —
          // PopupElement.Button.handleClick treats anything not literally
          // `false` as success and hides the popup.
          await opts.multiSelectAction.callback(from.getTime() / 1000 | 0, to.getTime() / 1000 | 0);
          return;
        }

        if(opts.onPickRange) {
          const end = selectionEnd();
          if(!end) return;
          const from = new Date(start);
          from.setHours(0, 0, 0, 0);
          const to = new Date(end);
          to.setHours(23, 59, 59, 999);
          return opts.onPickRange(from.getTime() / 1000 | 0, to.getTime() / 1000 | 0);
        }

        // Neither range nor action callback — fall back to single-pick on the start.
        return opts.onPick(start.getTime() / 1000 | 0);
      }

      const date = new Date(selectedDate());
      if(opts.withTime) {
        date.setHours(+hoursValue() || 0, +minutesValue() || 0, 0, 0);
      }
      opts.onPick(date.getTime() / 1000 | 0);
    }

    function onDanger() {
      opts.onPick(undefined);
    }

    // Footer (with the primary confirm button) is now ALWAYS rendered — the
    // popup never auto-confirms on a single cell click, so the user always
    // needs an explicit "Jump to Date" / "Save" / "N days selected" button to
    // commit the pick. The two extra side buttons stay opt-in.

    // ─── scroll plumbing ───────────────────────────────────────────────────
    const onScroll = () => {
      if(!scrollableContextRef) return;
      setScrollTop(scrollableContextRef.scrollPosition);
    };

    onMount(() => {
      // Defer to after first layout so the scrollable has its real dimensions.
      queueMicrotask(() => {
        if(scrollableContextRef) {
          setViewportHeight(scrollableContextRef.clientSize);
        }
        if(!didInitialScroll && scrollableHostRef && monthSections[initialMonthIndex]) {
          didInitialScroll = true;
          scrollableHostRef.scrollTop = monthSections[initialMonthIndex].offset;
          // setScrollTop manually because scrollTop assignment may not fire onScroll
          // synchronously in all browsers.
          if(scrollableContextRef) setScrollTop(scrollableContextRef.scrollPosition);
        }
      });
    });

    onCleanup(() => {
      listenerSetter.removeAll();
    });

    // ─── per-cell state derivation (only meaningful for kind: 'day' cells) ─
    // In multi-select mode the visual is built from three classes:
    //   .in-range          — solid bar background (covers endpoints + middle)
    //   .range-edge-left   — round the left edge of the bar (row start or range start)
    //   .range-edge-right  — round the right edge of the bar (row end or range end)
    // .active is reserved for single-pick mode and the partial (start-only) state.
    function isCellSelected(cell: CellModel & {kind: 'day'}): boolean {
      if(multiSelectActive()) {
        const start = selectionStart();
        if(!start) return false;
        // Both endpoints visually render as filled primary circles; the .in-range
        // bar paints only the cells BETWEEN them (via the .range-edge-* clipping).
        if(cell.date.getTime() === start.getTime()) return true;
        const end = selectionEnd();
        if(end && cell.date.getTime() === end.getTime()) return true;
        return false;
      }
      return cell.timestamp === selectedDate().getTime();
    }

    function isCellInRange(cell: CellModel & {kind: 'day'}): boolean {
      if(!multiSelectActive()) return false;
      const start = selectionStart();
      const end = selectionEnd();
      if(!start || !end) return false;
      return cell.date >= start && cell.date <= end;
    }

    function isCellRangeEdgeLeft(cell: CellModel & {kind: 'day'}, idx: number, cells: CellModel[]): boolean {
      if(!isCellInRange(cell)) return false;
      if(idx % 7 === 0) return true;
      const prev = cells[idx - 1];
      if(!prev || prev.kind !== 'day') return true;
      return !isCellInRange(prev);
    }

    function isCellRangeEdgeRight(cell: CellModel & {kind: 'day'}, idx: number, cells: CellModel[]): boolean {
      if(!isCellInRange(cell)) return false;
      if(idx % 7 === 6) return true;
      const next = cells[idx + 1];
      if(!next || next.kind !== 'day') return true;
      return !isCellInRange(next);
    }

    // The actual range start/end endpoints — different from edge-left/right,
    // which also fire for row boundaries. Endpoints clip the bar at the cell
    // center (where the .active circle sits); row-boundary non-endpoints round
    // the bar's outer edge.
    function isCellRangeStart(cell: CellModel & {kind: 'day'}): boolean {
      if(!multiSelectActive()) return false;
      const start = selectionStart();
      const end = selectionEnd();
      return !!(start && end && cell.date.getTime() === start.getTime());
    }

    function isCellRangeEnd(cell: CellModel & {kind: 'day'}): boolean {
      if(!multiSelectActive()) return false;
      const start = selectionStart();
      const end = selectionEnd();
      return !!(start && end && cell.date.getTime() === end.getTime());
    }

    function getCellMedia(cell: CellModel & {kind: 'day'}) {
      return mediaByDay().get(dayKey(cell.date));
    }

    return (
      <>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title>
            <div class="date-picker-month-title">{monthTitleEl()}</div>
          </PopupElement.Title>
          <div class="date-picker-controls">
            <Show when={showMultiSelectToggle}>
              <ButtonIconTsx
                icon="select"
                class={classNames('date-picker-multiselect', 'primary', multiSelectActive() && 'is-active')}
                noRipple
                onClick={toggleMultiSelect}
              />
            </Show>
            <ButtonIconTsx
              icon="up"
              class={classNames('date-picker-prev', 'primary')}
              noRipple
              disabled={isPrevDisabled()}
              onClick={onPrev}
            />
            <ButtonIconTsx
              icon="down"
              class={classNames('date-picker-next', 'primary')}
              noRipple
              disabled={isNextDisabled()}
              onClick={onNext}
            />
          </div>
        </PopupElement.Header>

        <PopupElement.Scrollable
          class="date-picker-scrollable"
          ref={(el) => scrollableHostRef = el}
          contextRef={(ctx) => scrollableContextRef = ctx}
          onScroll={onScroll}
          withBorders="both"
        >
          <div class="date-picker-months" style={{height: totalHeight + 'px'}}>
            <For each={visibleSections()}>{(section) => (
              <div
                class="date-picker-month-section"
                style={{transform: `translateY(${section.offset}px)`, height: section.height + 'px'}}
              >
                <div class="date-picker-month-label">
                  {new I18n.IntlDateElement({
                    date: section.date,
                    options: {year: 'numeric', month: 'long'}
                  }).element}
                </div>
                <div class="date-picker-weekdays">
                  <For each={weekdayInfo}>{(info) => (
                    <div class={classNames('date-picker-weekday', info.weekend && 'danger')}>{info.name}</div>
                  )}</For>
                </div>
                <div class="date-picker-month-grid">
                  <For each={section.cells}>{(cell, index) => {
                    if(cell.kind === 'spacer') {
                      return <div class="date-picker-spacer" />;
                    }

                    const media = createMemo(() => getCellMedia(cell));
                    const selected = createMemo(() => isCellSelected(cell));
                    const inRange = createMemo(() => isCellInRange(cell));
                    const edgeLeft = createMemo(() => isCellRangeEdgeLeft(cell, index(), section.cells));
                    const edgeRight = createMemo(() => isCellRangeEdgeRight(cell, index(), section.cells));
                    const rangeStart = createMemo(() => isCellRangeStart(cell));
                    const rangeEnd = createMemo(() => isCellRangeEnd(cell));
                    const cellWeekend = isWeekend(cell.date); // static per cell

                    return (
                      <button
                        class={classNames(
                          'btn-icon',
                          'date-picker-month-date',
                          selected() && 'active',
                          inRange() && 'in-range',
                          edgeLeft() && 'range-edge-left',
                          edgeRight() && 'range-edge-right',
                          rangeStart() && 'range-start',
                          rangeEnd() && 'range-end',
                          media() && 'with-media',
                          // .danger uses !important globally — only apply when
                          // it won't fight selection/range colors.
                          cellWeekend && !selected() && !inRange() && 'danger'
                        )}
                        disabled={cell.disabled}
                        onClick={() => onCellClick(cell)}
                      >
                        <Show when={media()}>
                          <DayMediaThumb message={media()} size={CELL_HEIGHT} />
                        </Show>
                        <span class="date-picker-day-num">{cell.date.getDate()}</span>
                      </button>
                    );
                  }}</For>
                </div>
              </div>
            )}</For>
          </div>
        </PopupElement.Scrollable>

        <Show when={opts.withTime}>
          <div class="date-picker-time">
            {hoursInputField.container}
            <div class="date-picker-time-delimiter">:</div>
            {minutesInputField.container}
          </div>
        </Show>

        <Show when={opts.minTimeDate}>
          <div class={classNames(
            suggestPostStyles.Caption,
            suggestPostStyles.center,
            !isMinTimeCaptionVisible() && 'hide'
          )}>
            {i18n('SuggestedPosts.PublishingTime.MinSendTime', [formatTime(opts.minTimeDate)])}
          </div>
        </Show>

        <Show when={opts.bodyAfter}>
          {opts.bodyAfter()}
        </Show>

        <PopupElement.Footer>
          <PopupElement.FooterButton
            color={confirmColor()}
            class={classNames(opts.btnConfirmLangKey && 'text-uppercase')}
            disabled={isConfirmDisabled()}
            callback={onConfirm}
          >
            {confirmLabel()}
          </PopupElement.FooterButton>

          <Show when={opts.footerAfter}>
            {opts.footerAfter()}
          </Show>

          <Show when={opts.btnDangerLangKey}>
            <PopupElement.FooterButton
              color="danger"
              class="popup-schedule-secondary text-uppercase"
              langKey={opts.btnDangerLangKey}
              callback={onDanger}
            />
          </Show>
        </PopupElement.Footer>
      </>
    );
  }

  createPopup(() => (
    <PopupElement
      class="popup-schedule popup-date-picker"
      closable
      kind={DATE_PICKER_POPUP_KIND}
      old
    >
      <Inner />
    </PopupElement>
  ));
}

// Local helper alias to keep the contextRef typing tidy.
type ScrollableContextValueOrUndefined = ScrollableContextValue | undefined;

// Renders the media thumbnail for a single day cell using the shared reply-style
// media renderer (so photos, videos, gifs, stickers and round videos all work).
// `createMiddleware()` registers its own onCleanup so an unmount mid-fetch
// cancels the pending wrap.
function DayMediaThumb(props: {message: Message.message, size: number}) {
  let containerRef: HTMLDivElement;
  const middleware = createMiddleware().get();

  onMount(() => {
    wrapReplyMedia({
      message: props.message,
      mediaEl: containerRef,
      size: props.size,
      middleware
    });
  });

  return <div ref={(el) => containerRef = el} class="date-picker-cell-photo" />;
}
