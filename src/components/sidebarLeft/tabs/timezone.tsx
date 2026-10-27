import {createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show} from 'solid-js';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import InputSearch from '@components/inputSearch';
import RadioFieldTsx from '@components/radioFieldTsx';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppTimezoneTab} from '@components/solidJsTabs/tabs';
import highlightText from '@helpers/dom/textHighlight';
import {randomLong} from '@helpers/random';
import {getSystemTimezoneId, getTimezoneName, getTimezoneOffsetName} from '@helpers/timezones';
import {Timezone} from '@layer';
import {i18n} from '@lib/langPack';

type AppTimezoneTabType = typeof AppTimezoneTab;

export type TimezoneTabPayload = {
  timezones: Timezone[],
  selected: string,
  onSelect: (id: string) => void
};

/** Android matches a query at a word start, `/` counting as a separator. */
const matchesQuery = (timezone: Timezone, query: string) => {
  const name = `${timezone.name} ${timezone.id}`.toLowerCase().replace(/[/_]/g, ' ');
  return name.startsWith(query) || name.includes(' ' + query);
};

const TimezoneTab = () => {
  const [tab] = useSuperTab<AppTimezoneTabType>();
  const {timezones, onSelect} = tab.payload;

  const systemTimezoneId = getSystemTimezoneId(timezones);
  const [selected, setSelected] = createSignal(tab.payload.selected);
  const [useSystem, setUseSystem] = createSignal(tab.payload.selected === systemTimezoneId);
  const [query, setQuery] = createSignal('');
  const radioName = randomLong();

  const filtered = createMemo(() => {
    const normalized = query().trim().toLowerCase();
    if(!normalized) return timezones;
    return timezones.filter((timezone) => matchesQuery(timezone, normalized));
  });

  const select = (id: string) => {
    setSelected(id);
    onSelect(id);
  };

  const toggleSystem = (value: boolean) => {
    setUseSystem(value);
    if(value) select(systemTimezoneId);
  };

  const inputSearch = new InputSearch({
    placeholder: 'Search',
    onChange: setQuery
  });

  onMount(() => {
    tab.title.replaceWith(inputSearch.container);
  });
  onCleanup(() => inputSearch.remove());

  return (
    <>
      <Show when={!query()}>
        <Section
          caption="TimezoneDetectAutomaticallyInfo"
          captionArgs={[getTimezoneName(timezones, selected(), true)]}
        >
          <Row>
            <Row.CheckboxFieldToggle>
              <CheckboxFieldTsx checked={useSystem()} toggle onChange={toggleSystem} />
            </Row.CheckboxFieldToggle>
            <Row.Title>{i18n('TimezoneDetectAutomatically')}</Row.Title>
          </Row>
        </Section>
      </Show>

      <Show
        when={filtered().length}
        fallback={
          <Section noContent caption={i18n('TimezoneNotFound')} />
        }
      >
        <Section name={!query() ? 'TimezoneHeader' : undefined}>
          <form>
            <For each={filtered()}>{(timezone) => (
              <Row disabled={useSystem() && !query().trim()}>
                <Row.RadioField>
                  <RadioFieldTsx
                    class="disable-hover"
                    checked={selected() === timezone.id}
                    name={radioName}
                    value={timezone.id}
                    onChange={(checked) => {
                      if(!checked) return;
                      setUseSystem(false);
                      select(timezone.id);
                    }}
                  />
                </Row.RadioField>
                <Row.Title ref={(element) => useHighlight(element, query)}>
                  {getTimezoneName(timezones, timezone.id)}
                </Row.Title>
                <Row.Subtitle>{getTimezoneOffsetName(timezone)}</Row.Subtitle>
              </Row>
            )}</For>
          </form>
        </Section>
      </Show>
    </>
  );
};

/** Paints the matched part of a row title, the way the settings search does. */
function useHighlight(container: HTMLElement, query: () => string) {
  createEffect(on(query, (value) => {
    const trimmed = value.trim();
    if(!trimmed) return;

    const highlight = highlightText({container, match: {type: 'search', query: trimmed}});
    onCleanup(() => highlight.dispose());
  }));
}

export default TimezoneTab;
