import {createUniqueId, For, JSX, Show} from 'solid-js';
import {i18n, LangPackKey} from '@lib/langPack';
import RadioFieldTsx from '@components/radioFieldTsx';
import Row from '@components/rowTsx';

export type RadioFormTsxValue<T extends number | string = number | string> = {
  checked?: boolean,
  langPackKey?: LangPackKey,
  subtitle?: JSX.Element,
  text?: string,
  textElement?: HTMLElement | DocumentFragment,
  value: T
};

export default function RadioFormTsx<T extends number | string>(props: {
  name?: string,
  onChange: (value: T, event: Event) => void,
  selected?: T,
  values: RadioFormTsxValue<T>[]
}) {
  const name = props.name || createUniqueId();

  return (
    <form>
      <For each={props.values}>{(item) => (
        <Row>
          <Row.RadioField>
            <RadioFieldTsx
              class="disable-hover"
              checked={props.selected === undefined ? item.checked : props.selected === item.value}
              name={name}
              value={String(item.value)}
              onChange={(checked, event) => checked && props.onChange(item.value, event)}
            />
          </Row.RadioField>
          <Row.Title>
            {item.langPackKey ? i18n(item.langPackKey) : item.textElement ?? item.text}
          </Row.Title>
          <Show when={item.subtitle !== undefined}>
            <Row.Subtitle>{item.subtitle}</Row.Subtitle>
          </Show>
        </Row>
      )}</For>
    </form>
  );
}
