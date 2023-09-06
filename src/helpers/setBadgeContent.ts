import replaceContent from './dom/replaceContent';

export default function setBadgeContent(badge: HTMLElement, content: Parameters<typeof replaceContent>[1]) {
  replaceContent(badge, content);
  badge.classList.toggle('is-badge-empty', !content);
}
