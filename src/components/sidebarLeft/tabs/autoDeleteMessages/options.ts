import formatDuration, {DurationType} from '@helpers/formatDuration';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import {oneDayInSeconds, oneMonthInSeconds, oneWeekInSeconds, oneYearInSeconds} from '@lib/constants';


export type Option = {
  value: number;
  label: () => Element;
};

export type DetailedOption = Option & {
  duration: number;
  type: DurationType;
};

const makeOption = (value: number, duration: number, type: DurationType) => ({
  value,
  label: () => wrapFormattedDuration([{duration, type}]),
  duration,
  type
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

export const customTimeOptions: DetailedOption[] = [
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


export function findBestMatchingOption<T extends Option>(period: number, options: T[]) {
  const threshold = 0.1;
  const isCloseTo = (period: number, targetPeriod: number) => targetPeriod > 0 && Math.abs(period - targetPeriod) / targetPeriod < threshold;

  for(const option of options) {
    if(isCloseTo(period, option.value)) return option;
  }

  return null;
}

export function findMatchingCustomOption(period: number) {
  return findBestMatchingOption(period, customTimeOptions);
}

export function findExistingOrCreateCustomOption(period: number): Option {
  return findMatchingCustomOption(period) || {
    label: () => wrapFormattedDuration(formatDuration(period)),
    value: period
  };
}
