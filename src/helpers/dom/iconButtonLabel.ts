import I18n, {LangPackKey} from '@lib/langPack';

// Only icons with an unambiguous action get a default. Context-specific actions
// (a gift, a participant, a filter, etc.) are named by their caller.
const labels: Partial<Record<Icon, LangPackKey>> = {
  close: 'Close',
  cross: 'Close',
  back: 'AccDescr.Back',
  left: 'AccDescr.Back',
  arrow_prev: 'AccDescr.Back',
  more: 'MultiAccount.More',
  search: 'Search',
  edit: 'Edit',
  delete: 'Delete',
  bin_filled: 'Delete',
  check: 'Done',
  play_filled: 'Play',
  pause_filled: 'Pause',
  forward: 'Forward',
  download: 'MediaViewer.Context.Download',
  copy: 'Copy',
  attach: 'Chat.Input.Attach',
  smile: 'Emoji',
  select: 'Message.Context.Select',
  settings_filled: 'Settings',
  fullscreen: 'ConferenceCall.Controls.EnterFullscreen',
  smallscreen: 'ConferenceCall.Controls.ExitFullscreen'
};

export function getIconButtonLabelKey(icon: Icon) {
  return labels[icon];
}

export default function iconButtonLabel(icon: Icon) {
  const key = getIconButtonLabelKey(icon);
  return key ? I18n.format(key, true) : undefined;
}
