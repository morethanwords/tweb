import detectLanguage from '@lib/tinyld/detect';
import {useAppSettings} from '@stores/appSettings';
import {useAppState} from '@stores/appState';
import getDoNotTranslateLanguages from '@helpers/getDoNotTranslateLanguages';

export default async function detectLanguageForTranslation(text: string): Promise<TranslatableLanguageISO> {
  const [appSettings] = useAppSettings();
  const [appState] = useAppState();
  if(
    !text ||
    !appSettings.translations.showInMenu ||
    appState.appConfig.translations_manual_enabled !== 'enabled'
  ) return;
  const language = await detectLanguage(text);
  // * the list the user sees, its default too (tdesktop's SkipTranslate: NonEmptySkipList): not the interface's language
  if(!getDoNotTranslateLanguages(appSettings.translations.doNotTranslate).includes(language)) {
    return language;
  }
}
