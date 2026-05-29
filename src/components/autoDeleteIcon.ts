import {DurationType} from '@helpers/formatDuration';
import Icon, {OverlayedIcon} from './icon';
import {findMatchingAutoDeleteIconOption} from './sidebarLeft/tabs/autoDeleteMessages/options';

const shiftedIcons = [DurationType.Days, DurationType.Years]

const typeToIcon: Partial<Record<DurationType, Icon>> = {
  [DurationType.Hours]: 'auto_delete_circle_hours',
  [DurationType.Days]: 'auto_delete_circle_days',
  [DurationType.Weeks]: 'auto_delete_circle_weeks',
  [DurationType.Months]: 'auto_delete_circle_months',
  [DurationType.Years]: 'auto_delete_circle_years'
};

const durationToIcon: Partial<Record<number, Icon>> = {
  1: 'auto_delete_circle_1',
  2: 'auto_delete_circle_2',
  3: 'auto_delete_circle_3',
  4: 'auto_delete_circle_4',
  5: 'auto_delete_circle_5',
  6: 'auto_delete_circle_6',
  7: 'auto_delete_circle_7',
  8: 'auto_delete_circle_8'
};

export function createAutoDeleteIcon(period?: number) {
  const defaultResult = () => Icon('auto_delete_circle_clock');

  if(!period) return defaultResult();

  const option = findMatchingAutoDeleteIconOption(period);
  if(!option) return defaultResult();

  const durationIcon = durationToIcon[option.duration];
  const typeIcon = typeToIcon[option.type];

  if(!durationIcon || !typeIcon) return defaultResult();

  const isShifted = shiftedIcons.includes(option.type);

  return OverlayedIcon(
    [
      'auto_delete_circle_empty',
      {
        icon: durationIcon,
        className: isShifted ? 'auto-delete-icon--shifted' : undefined
      },
      {
        icon: typeIcon,
        className: isShifted ? 'auto-delete-icon--shifted' : undefined
      }
    ],
  );
}
