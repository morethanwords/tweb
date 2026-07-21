import type {PendingSuggestionController} from '@components/sidebarLeft/pendingSuggestionController';
import {SimpleSuggestion} from '@components/sidebarLeft/pendingSuggestionItem';
import {toastNew} from '@components/toast';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import uiNotificationsManager from '@lib/uiNotificationsManager';
import {useAppSettings} from '@stores/appSettings';

function NotificationsSuggestion() {
  const [, setAppSettings] = useAppSettings();
  const emoji = () => wrapEmojiText('🔔');

  const onDismissed = () => {
    setAppSettings('notifications', 'suggested', true);
    toastNew({langPackKey: 'Suggestion.Notifications.Dismissed'});
  };

  const onClick = () => {
    Notification.requestPermission().then((permission) => {
      if(permission === 'granted') {
        setAppSettings('notifications', 'suggested', true);
        uiNotificationsManager.onPushConditionsChange();
      } else if(permission === 'denied') {
        throw 1;
      }
    }).catch(onDismissed);
  };

  return (
    <SimpleSuggestion
      emoji={emoji}
      title={i18n('Suggestion.Notifications', [emoji()])}
      subtitle={i18n('Suggestion.Notifications.Subtitle')}
      onClick={onClick}
      onClose={onDismissed}
    />
  );
}

export default function createNotificationsSuggestion(): PendingSuggestionController {
  const [appSettings] = useAppSettings();

  return {
    available: () => !appSettings.notifications.suggested && Notification.permission !== 'granted',
    component: NotificationsSuggestion
  };
}
