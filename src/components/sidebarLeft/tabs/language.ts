/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SettingSection } from "..";
import { randomLong } from "../../../helpers/random";
import I18n from "../../../lib/langPack";
import RadioField from "../../radioField";
import Row, { RadioFormFromRows } from "../../row";
import { SliderSuperTab } from "../../slider"

export default class AppLanguageTab extends SliderSuperTab {
  protected init() {
    this.container.classList.add('language-container');
    this.setTitle('Telegram.LanguageViewController');

    const section = new SettingSection({});

    const radioRows: Map<string, Row> = new Map();

    let r = [{
      code: 'en',
      text: 'English',
      subtitle: 'English'
    }, {
      code: 'be',
      text: 'Belarusian',
      subtitle: 'Беларуская'
    }, {
      code: 'ca',
      text: 'Catalan',
      subtitle: 'Català'
    }, {
      code: 'nl',
      text: 'Dutch',
      subtitle: 'Nederlands'
    }, {
      code: 'fr',
      text: 'French',
      subtitle: 'Français'
    }, {
      code: 'de',
      text: 'German',
      subtitle: 'Deutsch'
    }, {
      code: 'it',
      text: 'Italian',
      subtitle: 'Italiano'
    }, {
      code: 'ms',
      text: 'Malay',
      subtitle: 'Bahasa Melayu'
    }, {
      code: 'pl',
      text: 'Polish',
      subtitle: 'Polski'
    }, {
      code: 'pt',
      text: 'Portuguese (Brazil)',
      subtitle: 'Português (Brasil)'
    }, {
      code: 'ru',
      text: 'Russian',
      subtitle: 'Русский'
    }, {
      code: 'es',
      text: 'Spanish',
      subtitle: 'Español'
    }, {
      code: 'tr',
      text: 'Turkish',
      subtitle: 'Türkçe'
    }, {
      code: 'uk',
      text: 'Ukrainian',
      subtitle: 'Українська'
    }];

    const random = randomLong();
    r.forEach(({code, text, subtitle}) => {
      const row = new Row({
        radioField: new RadioField({
          text, 
          name: random, 
          value: code
        }),
        subtitle
      });
      
      radioRows.set(code, row);
    });

    const form = RadioFormFromRows([...radioRows.values()], (value) => {
      I18n.getLangPack(value);
    });

    I18n.getCacheLangPack().then(langPack => {
      const row = radioRows.get(langPack.lang_code);
      if(!row) {
        console.error('no row', row, langPack);
        return;
      }

      row.radioField.setValueSilently(true);
    });

    section.content.append(form);
    
    this.scrollable.append(section.container);
  }
}
