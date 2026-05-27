import {createSignal, Show} from 'solid-js';
import showDatePickerPopup from '@components/popups/datePicker';
import PopupElement from '@components/popups/indexTsx';
import Row from '@components/rowTsx';
import InlineSelect from '@components/sidebarLeft/tabs/passcodeLock/inlineSelect';
import {IconTsx} from '@components/iconTsx';
import {i18n} from '@lib/langPack';
import {hideToast, toastNew} from '@components/toast';
import anchorCallback from '@helpers/dom/anchorCallback';
import PopupPremium from '@components/popups/premium';
import {SEND_WHEN_ONLINE_TIMESTAMP} from '@appManagers/constants';
import rootScope from '@lib/rootScope';

const DAY = 86400;
const REPEAT_OPTIONS: {value: number, label: () => HTMLElement}[] = [
  {value: 0, label: () => i18n('Never')},
  {value: DAY, label: () => i18n('Schedule.Repeat.Daily')},
  {value: 7 * DAY, label: () => i18n('Schedule.Repeat.Weekly')},
  {value: 14 * DAY, label: () => i18n('Schedule.Repeat.Biweekly')},
  {value: 30 * DAY, label: () => i18n('Schedule.Repeat.Monthly')},
  {value: 91 * DAY, label: () => i18n('Schedule.Repeat.Every3Months')},
  {value: 182 * DAY, label: () => i18n('Schedule.Repeat.Every6Months')},
  {value: 365 * DAY, label: () => i18n('Schedule.Repeat.Yearly')}
];

export type ScheduleSendingPopupOptions = {
  initDate?: Date,
  addMinutes?: boolean,
  initRepeatPeriod?: number,
  canSendWhenOnline?: boolean,
  onPick: (timestamp: number, repeatPeriod?: number) => void
};

/**
 * Schedule-message variant of the date picker.
 *
 * Wraps {@link showDatePickerPopup} with two schedule-specific extras that
 * don't belong in the generic picker:
 *  - a "Repeat" row (premium-gated) that surfaces a recurring period selector
 *  - a "Send when online" secondary footer button that emits a sentinel
 *    {@link SEND_WHEN_ONLINE_TIMESTAMP}
 *
 * The picker stays domain-agnostic; everything specific to scheduling
 * messages lives here.
 */
export default function showScheduleSendingPopup(opts: ScheduleSendingPopupOptions): void {
  // Plain mutable variable rather than a Solid signal — we only need to read
  // it once at confirm time, and the RepeatRow component owns the reactive
  // state internally for its own UI.
  let selectedRepeatPeriod = opts.initRepeatPeriod || 0;

  showDatePickerPopup({
    initDate: opts.initDate ?? new Date(),
    addMinutes: opts.addMinutes ?? (opts.initDate === undefined),
    withTime: true,
    onPick: (timestamp) => {
      opts.onPick(timestamp, selectedRepeatPeriod || undefined);
    },
    bodyAfter: () => (
      <RepeatRow
        initValue={opts.initRepeatPeriod || 0}
        onChange={(v) => selectedRepeatPeriod = v}
      />
    ),
    footerAfter: opts.canSendWhenOnline ? () => (
      <PopupElement.FooterButton
        color="secondary"
        class="popup-schedule-secondary"
        langKey="Schedule.SendWhenOnline"
        callback={() => opts.onPick(SEND_WHEN_ONLINE_TIMESTAMP)}
      />
    ) : undefined
  });
}

function RepeatRow(props: {initValue: number, onChange: (value: number) => void}) {
  const [value, setValue] = createSignal(props.initValue);
  const [selectOpen, setSelectOpen] = createSignal(false);
  let rowEl: HTMLElement;

  function onClick() {
    if(!rootScope.premium) {
      toastNew({
        langPackKey: 'Schedule.Repeat.PremiumRequired',
        langPackArguments: [
          anchorCallback(() => {
            hideToast();
            PopupPremium.show();
          })
        ]
      });
      return;
    }
    setSelectOpen((v) => !v);
  }

  return (
    <Row
      ref={rowEl}
      clickable={onClick}
      class="popup-schedule-repeat"
    >
      <Row.Title>{i18n('Schedule.Repeat')}</Row.Title>
      <Row.RightContent>
        <InlineSelect
          value={value()}
          onChange={(next: number) => {
            setValue(next);
            props.onChange(next);
            setSelectOpen(false);
          }}
          options={REPEAT_OPTIONS}
          parent={rowEl}
          isOpen={selectOpen()}
          onClose={() => setSelectOpen(false)}
        />
        <Show when={!rootScope.premium}>
          <IconTsx icon="premium_lock" class="primary" />
        </Show>
      </Row.RightContent>
    </Row>
  );
}
