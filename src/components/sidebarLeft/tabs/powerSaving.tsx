import {onMount} from 'solid-js';
import type {StateSettings} from '@config/state';
import flatten from '@helpers/array/flatten';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {LiteModeKey} from '@helpers/liteMode';
import pause from '@helpers/schedulers/pause';
import CheckboxFields, {CheckboxFieldsField} from '@components/checkboxFields';
import Section from '@components/section';
import {toastNew} from '@components/toast';
import {useAppSettings} from '@stores/appSettings';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';

type PowerSavingCheckboxFieldsField = CheckboxFieldsField & {
  key: LiteModeKey
};

const PowerSaving = () => {
  const [tab] = useSuperTab();
  const [appSettings, setAppSettings] = useAppSettings();

  let formEl!: HTMLFormElement;
  let infoContentEl!: HTMLDivElement;
  let sectionContentEl!: HTMLDivElement;

  onMount(() => {
    tab.container.classList.add('power-saving-container');

    const keys: Array<LiteModeKey | [LiteModeKey, LiteModeKey[]]> = [
      'all',
      'video',
      'gif',
      ['stickers', ['stickers_panel', 'stickers_chat', 'emoji_appear']],
      // ['emoji', ['emoji_panel', 'emoji_messages']],
      ['effects', ['effects_reactions', 'effects_premiumstickers', 'effects_emoji']],
      ['chat', ['chat_background', 'chat_spoilers']],
      'animations',
      'blur'
    ];

    const wrap = (key: typeof keys[0]): PowerSavingCheckboxFieldsField[] => {
      const isArray = Array.isArray(key);
      const mainKey = isArray ? key[0] : key;
      const nested = isArray ? flatten(key[1].map(wrap)) : undefined;
      const value = appSettings.liteMode[mainKey];
      return [{
        key: mainKey,
        text: mainKey === 'all' ? 'LiteMode.EnableText' : `LiteMode.Key.${mainKey}.Title`,
        checked: mainKey === 'all' ? value : !value,
        nested: nested,
        name: 'power-saving-' + mainKey
      }, ...(nested || [])];
    };

    const fields = flatten(keys.map(wrap));

    const checkboxFields = new CheckboxFields({
      fields: fields,
      listenerSetter: tab.listenerSetter
    });

    fields.forEach((field, idx) => {
      const created = checkboxFields.createField(field);
      if(!created) {
        return;
      }

      const {nodes} = created;
      (idx === 0 ? infoContentEl : sectionContentEl).append(...nodes);
    });

    attachClickEvent(sectionContentEl, () => {
      if(appSettings.liteMode.all) {
        toastNew({langPackKey: 'LiteMode.DisableAlert'});
      }
    }, {listenerSetter: tab.listenerSetter});

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

    tab.listenerSetter.add(formEl)('change', async() => {
      const liteMode: StateSettings['liteMode'] = {} as any;
      fields.forEach((field) => {
        const checked = field.checkboxField.checked;
        liteMode[field.key] = field.key === 'all' ? checked : !checked;
      });

      const wasAll = appSettings.liteMode.all;
      if(wasAll !== liteMode.all) {
        onAllChange(!wasAll);

        if(liteMode.all) {
          await pause(200);
        }
      }

      setAppSettings('liteMode', liteMode);
    });

    onAllChange(appSettings.liteMode.all);
  });

  return (
    <form ref={formEl}>
      <Section caption="LiteMode.Info" contentProps={{ref: (el: HTMLDivElement) => infoContentEl = el}} />
      <Section contentProps={{ref: (el: HTMLDivElement) => sectionContentEl = el}} />
    </form>
  );
};

export default PowerSaving;
