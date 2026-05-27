import {createMemo, onMount} from 'solid-js';
import anchorCallback from '@helpers/dom/anchorCallback';
import {randomLong} from '@helpers/random';
import {LangPackLanguage} from '@layer';
import I18n, {i18n, join} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import usePremium from '@stores/premium';
import {pickLanguage} from '@components/chat/translation';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import PopupPremium from '@components/popups/premium';
import RadioField from '@components/radioField';
import Row, {RadioFormFromRows} from '@components/row';
import RowTsx from '@components/rowTsx';
import Section from '@components/section';
import {useAppSettings} from '@stores/appSettings';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — translation toggles + "Do not translate" picker
// ─────────────────────────────────────────────────────────────────────────────

const TranslateSection = () => {
  const [appSettings, setAppSettings] = useAppSettings();
  const isPremium = usePremium();

  const doNotTranslate = createMemo(() => {
    const arr = appSettings.translations.doNotTranslate;
    if(!arr.length) {
      return [I18n.langCodeNormalized()];
    }

    return arr;
  });

  return (
    <Section
      name="TranslateMessages"
      caption={isPremium() ? 'Translation.DoNotShow' : 'Language.TranslateMessages.Channel.Premium'}
      captionArgs={[anchorCallback(() => {
        PopupPremium.show({feature: 'translations'});
      })]}
    >
      <RowTsx>
        <RowTsx.CheckboxFieldToggle>
          <CheckboxFieldTsx
            checked={appSettings.translations.showInMenu}
            toggle
            onChange={(checked) => {
              setAppSettings('translations', 'showInMenu', checked);
            }}
          />
        </RowTsx.CheckboxFieldToggle>
        <RowTsx.Title>{i18n('ShowTranslateButton')}</RowTsx.Title>
      </RowTsx>
      <RowTsx
        fakeDisabled={!isPremium()}
        clickable={(e) => {
          if(!isPremium()) {
            e.preventDefault();
            PopupPremium.show({feature: 'translations'});
          }
        }}
      >
        <RowTsx.CheckboxFieldToggle>
          <CheckboxFieldTsx
            checked={appSettings.translations.enabled}
            toggle
            onChange={(checked) => {
              setAppSettings('translations', 'enabled', checked);
            }}
          />
        </RowTsx.CheckboxFieldToggle>
        <RowTsx.Title>{i18n('ShowTranslateChatButton')}</RowTsx.Title>
      </RowTsx>
      {appSettings.translations.enabled && (<RowTsx
        clickable={async() => {
          const languages = await pickLanguage(true, doNotTranslate());
          setAppSettings('translations', 'doNotTranslate', languages);
        }}
      >
        <RowTsx.Title
          titleRight={doNotTranslate().length < 3 ?
            join(doNotTranslate().map((lang) => i18n(`Language.${lang}`)), false) :
            i18n('Languages', [doNotTranslate().length])
          }
          titleRightSecondary
        >{i18n('DoNotTranslate')}</RowTsx.Title>
      </RowTsx>)}
    </Section>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — language radio list. The fetch is collected into the tab's
// promise collector so opening waits for the list (avoids showing an empty
// section that suddenly fills with 50+ rows). On repeat opens
// `invokeApiCacheable` returns synchronously from cache, so no real wait.
// ─────────────────────────────────────────────────────────────────────────────

const LanguageListSection = () => {
  const promiseCollector = usePromiseCollector();
  let containerEl!: HTMLDivElement;

  promiseCollector.collect((async() => {
    const langs1 = await rootScope.managers.apiManager.invokeApiCacheable('langpack.getLanguages', {
      lang_pack: 'web'
    });
    // macos langpack disabled in legacy tab — kept the structure for parity
    const langs2: LangPackLanguage[] = [];

    const radioRows = new Map<string, Row>();
    const rendered = new Set<string>();
    const webLangCodes = langs1.map((language) => language.lang_code);
    const random = randomLong();

    langs1.concat(langs2).forEach((language) => {
      if(rendered.has(language.lang_code)) return;
      rendered.add(language.lang_code);

      const row = new Row({
        radioField: new RadioField({
          text: language.name,
          name: random,
          value: language.lang_code
        }),
        subtitle: language.native_name
      });

      radioRows.set(language.lang_code, row);
    });

    const form = RadioFormFromRows([...radioRows.values()], (value) => {
      I18n.getLangPackAndApply(value, webLangCodes.includes(value));
    });

    containerEl.replaceChildren(form);

    const langPack = await I18n.getCacheLangPackAndApply();
    const row = radioRows.get(langPack.lang_code);
    if(!row) {
      console.error('no row', row, langPack);
      return;
    }

    row.radioField.setValueSilently(true);
  })());

  return (
    <Section>
      <div ref={containerEl} />
    </Section>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab root
// ─────────────────────────────────────────────────────────────────────────────

const Language = () => {
  const [tab] = useSuperTab();

  onMount(() => {
    tab.header.classList.add('with-border');
    tab.container.classList.add('language-container');
  });

  return (
    <>
      <TranslateSection />
      <LanguageListSection />
    </>
  );
};

export default Language;
