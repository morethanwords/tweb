/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {StateSettings} from '../../../config/state';
import flatten from '../../../helpers/array/flatten';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import {LiteModeKey} from '../../../helpers/liteMode';
import {joinDeepPath} from '../../../helpers/object/setDeepProperty';
import pause from '../../../helpers/schedulers/pause';
import rootScope from '../../../lib/rootScope';
import CheckboxFields, {CheckboxFieldsField} from '../../checkboxFields';
import SettingSection from '../../settingSection';
import SliderSuperTab from '../../sliderTab';
import {toastNew} from '../../toast';

type PowerSavingCheckboxFieldsField = CheckboxFieldsField & {
  key: LiteModeKey
};

export default class AppPowerSavingTab extends SliderSuperTab {
  public init() {
    this.container.classList.add('power-saving-container');
    this.setTitle('LiteMode.Title');

    const form = document.createElement('form');

    let infoSection: SettingSection;
    {
      const section = infoSection = new SettingSection({
        caption: 'LiteMode.Info'
      });

      form.append(section.container);
    }

    const keys: Array<LiteModeKey | [LiteModeKey, LiteModeKey[]]> = [
      'all',
      'video',
      'gif',
      ['stickers', ['stickers_panel', 'stickers_chat']],
      // ['emoji', ['emoji_panel', 'emoji_messages']],
      ['effects', ['effects_reactions', 'effects_premiumstickers', 'effects_emoji']],
      ['chat', ['chat_background', 'chat_spoilers']],
      'animations'
    ];

    let fields: PowerSavingCheckboxFieldsField[], checkboxFields: CheckboxFields<PowerSavingCheckboxFieldsField>;
    {
      const section = new SettingSection({});

      const wrap = (key: typeof keys[0]): PowerSavingCheckboxFieldsField[] => {
        const isArray = Array.isArray(key);
        const mainKey = isArray ? key[0] : key;
        const nested = isArray ? flatten(key[1].map(wrap)) : undefined;
        const value = rootScope.settings.liteMode[mainKey];
        return [{
          key: mainKey,
          text: mainKey === 'all' ? 'LiteMode.EnableText' : `LiteMode.Key.${mainKey}.Title`,
          checked: mainKey === 'all' ? value : !value,
          nested: nested,
          name: 'power-saving-' + mainKey
        }, ...(nested || [])];
      };

      fields = flatten(keys.map(wrap));

      checkboxFields = new CheckboxFields({
        fields: fields,
        listenerSetter: this.listenerSetter
      });

      fields.forEach((field, idx) => {
        const created = checkboxFields.createField(field);
        if(!created) {
          return;
        }

        const {row, nodes} = created;
        (idx === 0 ? infoSection : section).content.append(...nodes);
      });

      attachClickEvent(section.content, () => {
        if(rootScope.settings.liteMode.all) {
          toastNew({langPackKey: 'LiteMode.DisableAlert'});
        }
      }, {listenerSetter: this.listenerSetter});

      form.append(section.container);
    }

    const onAllChange = (disable: boolean) => {
      fields.forEach((field) => {
        if(field.key === 'all') {
          return;
        }

        if(field.nested) {
          checkboxFields.setNestedCounter(field, disable ? 0 : undefined);
        }

        field.checkboxField.input.classList.toggle('is-fake-disabled', disable);
        field.row.toggleDisability(disable);
      });
    };

    this.listenerSetter.add(form)('change', async() => {
      const liteMode: StateSettings['liteMode'] = {} as any;
      fields.forEach((field) => {
        const checked = field.checkboxField.checked;
        liteMode[field.key] = field.key === 'all' ? checked : !checked;
      });

      const wasAll = rootScope.settings.liteMode.all;
      if(wasAll !== liteMode.all) {
        onAllChange(!wasAll);

        if(liteMode.all) {
          await pause(200);
        }
      }

      await this.managers.appStateManager.setByKey(joinDeepPath('settings', 'liteMode'), rootScope.settings.liteMode = liteMode);
    });

    onAllChange(rootScope.settings.liteMode.all);

    this.scrollable.append(form);
  }
}
