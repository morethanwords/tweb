import detectLanguage from '../lib/tinyld/detect';
import {useAppSettings} from '../stores/appSettings';

export default async function detectLanguageForTranslation(text: string): Promise<TranslatableLanguageISO> {
  const [appSettings] = useAppSettings();
  if(!text || !appSettings.translations.showInMenu) return;
  const language = await detectLanguage(text);
  if(!appSettings.translations.doNotTranslate.includes(language)) {
    return language;
  }
}
