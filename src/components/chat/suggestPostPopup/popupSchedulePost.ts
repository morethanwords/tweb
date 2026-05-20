import showDatePickerPopup, {DatePickerPopupOptions} from '@components/popups/datePicker';

type Args = {
  minTimeDate: Date;
} & Omit<DatePickerPopupOptions, 'withTime' | 'addMinutes' | 'minTimeDate'>;

export default function showSchedulePostPopup(args: Args): void {
  const {minTimeDate, ...rest} = args;
  showDatePickerPopup({
    ...rest,
    withTime: true,
    minTimeDate
  });
}
