import detectLanguage from '../lib/tinyld/detect';
import {useAppSettings} from '../stores/appSettings';
import {useAppState} from '../stores/appState';

export default async function detectLanguageForTranslation(text: string): Promise<TranslatableLanguageISO> {
  const [appSettings] = useAppSettings();
  const [appState] = useAppState();
  if(
    !text ||
    !appSettings.translations.showInMenu ||
    appState.appConfig.translations_manual_enabled !== 'enabled'
  ) return;
  const language = await detectLanguage(text);
  if(!appSettings.translations.doNotTranslate.includes(language)) {
    return language;
  }
}
