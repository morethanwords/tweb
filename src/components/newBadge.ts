import {_i18n} from '@lib/langPack';

export default function createNewBadge() {
  const badge = document.createElement('span');
  badge.classList.add('badge', 'badge-rectangle', 'badge-new');
  _i18n(badge, 'New');
  return badge;
}
