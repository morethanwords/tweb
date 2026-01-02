import formatDuration, {DurationType} from '../../../../helpers/formatDuration';
import {wrapFormattedDuration} from '../../../wrappers/wrapDuration';

export const oneDayInSeconds = 24 * 60 * 60;
export const oneWeekInSeconds = oneDayInSeconds * 7;
export const oneMonthInSeconds = oneDayInSeconds * 31;
export const oneYearInSeconds = oneDayInSeconds * 365;

export type Option = {
  value: number;
  label: () => Element;
};

const makeOption = (value: number, duration: number, type: DurationType) => ({
  value,
  label: () => wrapFormattedDuration([{duration, type}])
});

type GetDefaultOptionsArgs = {
  offLabel: () => Element;
};

export const getDefaultOptions = ({offLabel}: GetDefaultOptionsArgs): Option[] => [
  {
    value: 0,
    label: offLabel
  },
  makeOption(oneDayInSeconds, 1, DurationType.Days),
  makeOption(oneWeekInSeconds, 1, DurationType.Weeks),
  makeOption(oneMonthInSeconds, 1, DurationType.Months)
];

export const customTimeOptions: Option[] = [
  makeOption(oneDayInSeconds, 1, DurationType.Days),
  makeOption(oneDayInSeconds * 2, 2, DurationType.Days),
  makeOption(oneDayInSeconds * 3, 3, DurationType.Days),
  makeOption(oneDayInSeconds * 4, 4, DurationType.Days),
  makeOption(oneDayInSeconds * 5, 5, DurationType.Days),
  makeOption(oneDayInSeconds * 6, 6, DurationType.Days),
  makeOption(oneWeekInSeconds, 1, DurationType.Weeks),
  makeOption(oneWeekInSeconds * 2, 2, DurationType.Weeks),
  makeOption(oneWeekInSeconds * 3, 3, DurationType.Weeks),
  makeOption(oneMonthInSeconds, 1, DurationType.Months),
  makeOption(oneMonthInSeconds * 2, 2, DurationType.Months),
  makeOption(oneMonthInSeconds * 3, 3, DurationType.Months),
  makeOption(oneMonthInSeconds * 4, 4, DurationType.Months),
  makeOption(oneMonthInSeconds * 5, 5, DurationType.Months),
  makeOption(oneMonthInSeconds * 6, 6, DurationType.Months),
  makeOption(oneYearInSeconds, 1, DurationType.Years)
];

function findMatchingCustomOption(period: number) {
  for(const option of customTimeOptions) {
    if(period === option.value) return option;
  }

  return null;
}

export function tryFindMatchingCustomOption(period: number) {
  return findMatchingCustomOption(period) || {
    label: () => wrapFormattedDuration(formatDuration(period)),
    value: period
  };
}
