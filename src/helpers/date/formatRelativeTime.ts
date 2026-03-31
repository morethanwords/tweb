import type {LangPackKey} from '@lib/langPack';

export default function formatRelativeTime(timestampSec: number, nowSec: number): {
  key: LangPackKey,
  args?: [number],
  updateInterval: number
} {
  const diff = nowSec - timestampSec;
  const absDiff = Math.abs(diff);
  const isPast = diff > 0;

  if(absDiff < 3) {
    return {key: 'FormattedDate.JustNow', updateInterval: (3 - absDiff) * 1000 || 1000};
  }

  if(absDiff < 60) {
    return {
      key: isPast ? 'FormattedDate.SecondsAgo' : 'FormattedDate.InSeconds',
      args: [absDiff],
      updateInterval: 1000
    };
  }

  if(absDiff < 3600) {
    return {
      key: isPast ? 'FormattedDate.MinutesAgo' : 'FormattedDate.InMinutes',
      args: [absDiff / 60 | 0],
      updateInterval: nextBoundaryDelay(absDiff, 60, isPast)
    };
  }

  if(absDiff < 86400) {
    return {
      key: isPast ? 'FormattedDate.HoursAgo' : 'FormattedDate.InHours',
      args: [absDiff / 3600 | 0],
      updateInterval: nextBoundaryDelay(absDiff, 3600, isPast)
    };
  }

  if(absDiff < 604800) {
    return {
      key: isPast ? 'FormattedDate.DaysAgo' : 'FormattedDate.InDays',
      args: [absDiff / 86400 | 0],
      updateInterval: nextBoundaryDelay(absDiff, 86400, isPast)
    };
  }

  if(absDiff < 2592000) {
    return {
      key: isPast ? 'FormattedDate.WeeksAgo' : 'FormattedDate.InWeeks',
      args: [absDiff / 604800 | 0],
      updateInterval: nextBoundaryDelay(absDiff, 604800, isPast)
    };
  }

  if(absDiff < 31536000) {
    return {
      key: isPast ? 'FormattedDate.MonthsAgo' : 'FormattedDate.InMonths',
      args: [absDiff / 2592000 | 0],
      updateInterval: nextBoundaryDelay(absDiff, 2592000, isPast)
    };
  }

  return {
    key: isPast ? 'FormattedDate.YearsAgo' : 'FormattedDate.InYears',
    args: [absDiff / 31536000 | 0],
    updateInterval: nextBoundaryDelay(absDiff, 31536000, isPast)
  };
}

function nextBoundaryDelay(absDiff: number, unit: number, isPast: boolean): number {
  const remainder = absDiff % unit;
  const seconds = isPast ? (unit - remainder) : (remainder || unit);
  return seconds * 1000;
}
