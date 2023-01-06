/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {randomLong} from '../../../helpers/random';
import {LangPackLanguage} from '../../../layer';
import I18n from '../../../lib/langPack';
import rootScope from '../../../lib/rootScope';
import RadioField from '../../radioField';
import Row, {RadioFormFromRows} from '../../row';
import SettingSection from '../../settingSection';
import {SliderSuperTab} from '../../slider'

export default class AppLanguageTab extends SliderSuperTab {
  public static getInitArgs() {
    return {
      languages1: rootScope.managers.apiManager.invokeApiCacheable('langpack.getLanguages', {
        lang_pack: 'web'
      }),
      // languages2: rootScope.managers.apiManager.invokeApiCacheable('langpack.getLanguages', {
      //   lang_pack: 'macos'
      // })
      languages2: Promise.resolve([] as LangPackLanguage[])
    };
  }

  public init(p: ReturnType<typeof AppLanguageTab['getInitArgs']>) {
    this.header.classList.add('with-border');
    this.container.classList.add('language-container');
    this.setTitle('Telegram.LanguageViewController');

    const section = new SettingSection({});

    const radioRows: Map<string, Row> = new Map();

    const promise = Promise.all([
      p.languages1,
      p.languages2
    ]).then(([languages1, languages2]) => {
      const rendered: Set<string> = new Set();
      const webLangCodes = languages1.map((language) => language.lang_code);

      const random = randomLong();
      languages1.concat(languages2).forEach((language) => {
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
        I18n.getLangPack(value, webLangCodes.includes(value));
      });

      I18n.getCacheLangPack().then((langPack) => {
        const row = radioRows.get(langPack.lang_code);
        if(!row) {
          console.error('no row', row, langPack);
          return;
        }

        row.radioField.setValueSilently(true);
      });

      section.content.append(form);
    });

    this.scrollable.append(section.container);

    return promise;
  }
}
