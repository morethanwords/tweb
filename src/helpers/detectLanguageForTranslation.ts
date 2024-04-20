import detectLanguage from '../lib/tinyld/detect';
import {useAppState} from '../stores/appState';

export default async function detectLanguageForTranslation(text: string): Promise<TranslatableLanguageISO> {
  const [appState] = useAppState();
  if(!text || !appState.translations.showInMenu) return;
  const language = await detectLanguage(text);
  if(!appState.translations.doNotTranslate.includes(language)) {
    return language;
  }
}
