import I18n from '@lib/langPack';
import capitalizeFirstLetter from '@helpers/string/capitalizeFirstLetter';
import type {MessageEntity} from '@layer';

type FormattedDatePFlags = MessageEntity.messageEntityFormattedDate['pFlags'];

export default function formatFormattedDate(timestampSec: number, pFlags: FormattedDatePFlags): string {
  const date = new Date(timestampSec * 1000);
  const options: Intl.DateTimeFormatOptions = {};

  if(pFlags.short_date) {
    options.year = '2-digit';
    options.month = 'numeric';
    options.day = 'numeric';
  }

  if(pFlags.long_date) {
    options.year = 'numeric';
    options.month = 'long';
    options.day = 'numeric';
  }

  if(pFlags.day_of_week) {
    options.weekday = 'long';
  }

  if(pFlags.short_time) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }

  if(pFlags.long_time) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.second = '2-digit';
  }

  return capitalizeFirstLetter(I18n.getDateTimeFormat(options).format(date));
}
