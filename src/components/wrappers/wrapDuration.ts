/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import I18n, {LangPackKey, i18n, join} from '../../lib/langPack';
import formatDuration, {DurationType} from '../../helpers/formatDuration';
import toHHMMSS from '../../helpers/string/toHHMMSS';

export const DURATION_LANG_KEYS: {[type in DurationType]: LangPackKey} = {
  [DurationType.Seconds]: 'Seconds',
  [DurationType.Minutes]: 'Minutes',
  [DurationType.Hours]: 'Hours',
  [DurationType.Days]: 'Days',
  [DurationType.Weeks]: 'Weeks',
  [DurationType.Months]: 'Months',
  [DurationType.Years]: 'Years'
};

export function wrapFormattedDuration(formatted: ReturnType<typeof formatDuration>, plain?: boolean) {
  if(plain) {
    const strings = formatted.map((d) => I18n.format(DURATION_LANG_KEYS[d.type], true, [d.duration]));
    return join(strings, false, plain);
  }

  const elements = formatted.map((d) => i18n(DURATION_LANG_KEYS[d.type], [d.duration]));

  const fragment = document.createElement('span');
  fragment.append(...join(elements, false));

  return fragment;
}

export function wrapCallDuration(duration: number, plain?: boolean) {
  return wrapFormattedDuration(formatDuration(duration, 2), plain);
}

export function wrapLeftDuration(timeLeft: number) {
  const formatted = formatDuration(timeLeft, 3);
  if(formatted[0].type <= DurationType.Hours) {
    return toHHMMSS(timeLeft, true);
  } else {
    formatted.splice(1, Infinity);
    return wrapFormattedDuration(formatted);
  }
}

export function wrapSlowModeLeftDuration(timeLeft: number) {
  const formatted = formatDuration(timeLeft, 3);
  if(formatted[0].type === DurationType.Seconds) {
    return wrapFormattedDuration(formatted);
  } else {
    return toHHMMSS(timeLeft, true);
  }
}
