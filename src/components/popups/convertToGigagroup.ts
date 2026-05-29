import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import confirmationPopup from '@components/confirmationPopup';
import {toastNew} from '@components/toast';

export default async function showConvertToGigagroupPopup(chatId: ChatId) {
  const features = document.createElement('ul');
  features.classList.add('popup-description-features');
  (['BroadcastGroupConvertFeature1', 'BroadcastGroupConvertFeature2', 'BroadcastGroupConvertFeature3'] as const).forEach((key) => {
    const li = document.createElement('li');
    li.append(i18n(key));
    features.append(li);
  });

  try {
    await confirmationPopup({
      titleLangKey: 'BroadcastGroupConvertTitle',
      description: features,
      button: {langKey: 'BroadcastGroupConvertAction'}
    });
  } catch(_) {
    return;
  }

  try {
    await confirmationPopup({
      titleLangKey: 'BroadcastGroupConvertWarningTitle',
      descriptionLangKey: 'BroadcastGroupConvertWarning',
      button: {langKey: 'BroadcastGroupConvertAction', isDanger: true}
    });
  } catch(_) {
    return;
  }

  const config = await rootScope.managers.apiManager.getConfig();
  await rootScope.managers.appChatsManager.convertToGigagroup(chatId);
  toastNew({langPackKey: 'BroadcastGroupConvertDone', langPackArguments: [config.megagroup_size_max]});
}
