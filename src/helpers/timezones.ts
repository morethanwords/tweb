import {Timezone} from '@layer';

/**
 * Helpers around `help.getTimezonesList`, mirroring Android's `TimezonesController`
 * (TMessagesProj/src/main/java/org/telegram/ui/Business/TimezonesController.java).
 */

export function findTimezone(timezones: Timezone[], id: string) {
  return id ? timezones?.find((timezone) => timezone.id === id) : undefined;
}

/** `GMT`, `GMT+03:00`, `GMT-05:30` — the offset label shown next to a zone's name. */
export function getTimezoneOffsetName(timezone: Timezone) {
  const utcOffset = timezone?.utc_offset || 0;
  if(!utcOffset) {
    return 'GMT';
  }

  const value = Math.abs(utcOffset) / 60;
  const hours = Math.floor(value / 60);
  const minutes = Math.floor(value % 60);
  const pad = (n: number) => (n < 10 ? '0' : '') + n;
  return `GMT${utcOffset < 0 ? '-' : '+'}${pad(hours)}:${pad(minutes)}`;
}

export function getTimezoneName(timezones: Timezone[], id: string, withOffset?: boolean): string {
  const timezone = findTimezone(timezones, id);
  if(timezone) {
    return withOffset ? `${timezone.name}, ${getTimezoneOffsetName(timezone)}` : timezone.name;
  }

  if(!id) {
    return '';
  }

  // the server doesn't know this zone (stale list, or a zone the browser invented) —
  // fall back to a readable version of the IANA id
  const name = id.replace(/\//g, ', ').replace(/_/g, ' ');
  if(!withOffset) {
    return name;
  }

  const offset = getBrowserTimezoneUtcOffset(id);
  return offset === undefined ? name : `${name}, ${getTimezoneOffsetName({_: 'timezone', id, name, utc_offset: offset})}`;
}

/** Seconds east of UTC for an IANA zone id, right now. `undefined` when the id is unknown. */
export function getBrowserTimezoneUtcOffset(id: string) {
  try {
    // `longOffset` renders as `GMT+03:00` / `GMT` — Intl is the only way to read
    // an arbitrary zone's current offset without a tz database of our own.
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: id,
      timeZoneName: 'longOffset'
    }).format(new Date());
    const match = formatted.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if(!match) {
      return formatted.includes('GMT') ? 0 : undefined;
    }

    const sign = match[1] === '-' ? -1 : 1;
    return sign * (+match[2] * 3600 + (+(match[3] || 0)) * 60);
  } catch{
    return undefined;
  }
}

export function getBrowserTimezoneId() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch{
    return undefined;
  }
}

/**
 * The zone the business hours default to: the browser's own zone when the server
 * knows it, otherwise the first server zone with the same UTC offset.
 */
export function getSystemTimezoneId(timezones: Timezone[]) {
  const browserId = getBrowserTimezoneId();
  if(!timezones?.length) {
    return browserId;
  }

  if(findTimezone(timezones, browserId)) {
    return browserId;
  }

  const utcOffset = browserId ?
    getBrowserTimezoneUtcOffset(browserId) :
    -new Date().getTimezoneOffset() * 60;
  const sameOffset = timezones.find((timezone) => timezone.utc_offset === utcOffset);
  return sameOffset?.id || timezones[0].id;
}
