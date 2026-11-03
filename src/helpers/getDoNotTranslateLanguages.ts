import I18n from '@lib/langPack';
import Languages from '@lib/tinyld/languages';

/**
 * The languages not to offer a translation of. Until the user picks them (Settings → Language → Do not translate):
 * the interface's language, and the browser's when a translation knows it - shown in that list and taken off there
 * like any other, as Android does with the system language. Once picked, the list is the user's alone
 */
export default function getDoNotTranslateLanguages(picked: TranslatableLanguageISO[]): TranslatableLanguageISO[] {
  if(picked.length) {
    return picked;
  }

  const languages = [I18n.langCodeNormalized()];
  const browserLanguage = navigator.language?.split('-')[0] as TranslatableLanguageISO;
  if(
    browserLanguage &&
    !languages.includes(browserLanguage) &&
    Languages.some(([iso2]) => iso2 === browserLanguage)
  ) {
    languages.push(browserLanguage);
  }

  return languages;
}

/**
 * A language put on the list from a chat goes onto the list the user sees: one never picked is the default one, which
 * stays on it
 */
export function addDoNotTranslateLanguage(picked: TranslatableLanguageISO[], language: TranslatableLanguageISO) {
  const languages = getDoNotTranslateLanguages(picked);
  return languages.includes(language) ? languages : [...languages, language];
}
