import {createSignal, JSX, onCleanup, onMount, Show} from 'solid-js';

import Button from '@components/buttonTsx';
import {GrowHeightReveal} from '@helpers/solid/animations';
import loadFonts from '@helpers/dom/loadFonts';
import {Config, LangPackString} from '@layer';
import I18n, {LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';

const KEY: LangPackKey = 'Login.ContinueOnLanguage';

type LangPayload = {config: Config.config, strings: LangPackString[]};

let cachedPromise: Promise<LangPayload | undefined>;
let appliedAlready = false;

function getLang() {
  return cachedPromise ||= rootScope.managers.apiManager.getConfig().then(async(config) => {
    if(config.suggested_lang_code === I18n.getLastRequestedLangCode()) {
      return undefined;
    }
    const [strings] = await Promise.all([
      I18n.getStrings(config.suggested_lang_code, [KEY]),
      I18n.getCacheLangPackAndApply()
    ]);
    return {config, strings};
  });
}

// Format the key with the suggested-language strings without leaving the
// app's I18n.strings map mutated — back up, swap in, format, restore.
function formatSuggestedText(strings: LangPackString[]) {
  const backup: LangPackString[] = [];
  strings.forEach((string) => {
    const backupString = I18n.strings.get(string.key as LangPackKey);
    if(!backupString) return;
    backup.push(backupString);
    I18n.strings.set(string.key as LangPackKey, string);
  });

  const text = I18n.format(KEY, true);
  backup.forEach((string) => I18n.strings.set(string.key as LangPackKey, string));
  return text;
}

export default function LanguageChangeButton(): JSX.Element {
  const [visible, setVisible] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [content, setContent] = createSignal<string>('');
  let suggestedLangCode: string;

  const onLanguageApply = () => setVisible(false);
  rootScope.addEventListener('language_apply', onLanguageApply, {once: true});
  onCleanup(() => rootScope.removeEventListener('language_apply', onLanguageApply));

  onMount(async() => {
    if(appliedAlready) return;

    const payload = await getLang();
    if(!payload) return;

    suggestedLangCode = payload.config.suggested_lang_code;
    const text = formatSuggestedText(payload.strings);
    await loadFonts({text: [text]});

    setContent(text);
    setVisible(true);
  });

  const onClick = () => {
    appliedAlready = true;
    setSubmitting(true);
    I18n.getLangPackAndApply(suggestedLangCode);
  };

  return (
    <GrowHeightReveal when={visible()}>
      <Button
        class="btn-primary btn-secondary btn-primary-transparent primary"
        disabled={submitting()}
        onClick={onClick}
      >
        {content()}
        <Show when={submitting()}>
          <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="25 25 50 50">
            <circle class="preloader-path" cx="50" cy="50" r="20" fill="none" stroke-miterlimit="10"/>
          </svg>
        </Show>
      </Button>
    </GrowHeightReveal>
  );
}
