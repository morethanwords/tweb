import replaceContent from '@helpers/dom/replaceContent';
import {setRollingText} from '@components/animatedCounter';

export default function setBadgeContent(badge: HTMLElement, content: Parameters<typeof replaceContent>[1]) {
  replaceContent(badge, content);
  badge.classList.toggle('is-badge-empty', !content);
}

/** the count each badge was last given - which way a new one rolls, and whether it was shown */
const badgeCounts: WeakMap<HTMLElement, number> = new WeakMap();

/**
 * Writes a count into a badge as `text` (the count itself unless given, `1.2K` say): one that
 * changes on a badge in sight rolls to the new one (`setRollingText`), as unread counters do in
 * the official apps, while a badge that comes or goes - from or to no count - does not roll, nor
 * does one that is not a change of the same count (`animate: false` - another chat's, say).
 * The badge's `is-badge-empty` is left to whoever renders it (`<Badge count>`)
 */
export function rollBadgeCount(badge: HTMLElement, count: number, text?: string, animate = true) {
  count ||= 0;
  text = count ? text ?? '' + count : '';
  const previous = badgeCounts.get(badge);
  badgeCounts.set(badge, count);
  setRollingText({
    element: badge,
    text,
    direction: count - (previous || 0),
    animate: animate && !!previous && !!count
  });
}

/** `rollBadgeCount`, hiding the badge without a count */
export function setBadgeCount(badge: HTMLElement, count: number, text?: string, animate?: boolean) {
  rollBadgeCount(badge, count, text, animate);
  badge.classList.toggle('is-badge-empty', !count);
}
