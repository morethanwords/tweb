import {createMemo, For, JSX, Show} from 'solid-js';
import Row from '@components/rowTsx';
import Section from '@components/section';
import EmptySearchPlaceholder from '@components/emptySearchPlaceholder';
import {copyTextToClipboard} from '@helpers/clipboard';
import {toastNew} from '@components/toast';
import {
  getSettingsSearchPath,
  getSettingsSearchSuggestions,
  getSettingsSearchTitle,
  searchSettings,
  SettingsSearchItem
} from '@lib/settingsSearch';
import {getSettingsLink} from '@lib/settingsSearch/link';
import {getRecentSettingsSearch, removeRecentSettingsSearch} from '@lib/settingsSearch/recent';
import {settingsSearchVersion} from '@lib/settingsSearch/registry';

if(import.meta.hot) import.meta.hot.accept();

/** `EmptySearchPlaceholder` is a custom element class, not a Solid component. */
const NoResults = () => new EmptySearchPlaceholder() as unknown as JSX.Element;

const ResultRow = (props: {
  item: SettingsSearchItem,
  /** Results of one category run share an icon, drawn on the first of them. */
  startsCategory: boolean,
  onSelect: (item: SettingsSearchItem) => void
}) => {
  const path = createMemo(() => getSettingsSearchPath(props.item));

  const link = createMemo(() => getSettingsLink(props.item));

  const copyLink = () => {
    copyTextToClipboard(link());
    toastNew({langPackKey: 'LinkCopied'});
  };

  return (
    <Row
      clickable={() => props.onSelect(props.item)}
      contextMenu={{buttons: [{
        icon: 'link',
        text: 'CopyLink',
        onClick: copyLink,
        verify: () => !!link()
      }, {
        icon: 'delete',
        text: 'DeleteFromRecent',
        onClick: () => removeRecentSettingsSearch(props.item.id),
        verify: () => getRecentSettingsSearch().includes(props.item.id)
      }]}}
      havePadding
    >
      <Show when={props.startsCategory && props.item.categoryIcon}>
        <Row.Icon icon={props.item.categoryIcon} />
      </Show>
      <Row.Title>{getSettingsSearchTitle(props.item)}</Row.Title>
      <Show when={path()}>
        <Row.Subtitle>{path()}</Row.Subtitle>
      </Show>
    </Row>
  );
};

/**
 * The list shown while the Settings header is in search mode: matches for the
 * current query, or the last picked results when nothing is typed yet.
 */
const SettingsSearchResults = (props: {
  query: string,
  onSelect: (item: SettingsSearchItem) => void
}) => {
  const query = createMemo(() => props.query.trim());

  // Picking a result puts it in front of the recents, but reordering the list
  // the user is looking at makes it jump under the cursor — so what is on screen
  // keeps the order it opened with. Only leaving the search picks up the new one.
  const recentIds = createMemo((previous: string[]) => {
    const recent = getRecentSettingsSearch();
    const kept = previous.filter((id) => recent.includes(id));
    return kept.concat(recent.filter((id) => !kept.includes(id)));
  }, []);

  const items = createMemo(() => {
    settingsSearchVersion(); // re-run when the index is rebuilt (hot reload, language change)
    return query() ? searchSettings(query()) : getSettingsSearchSuggestions(recentIds());
  });

  return (
    <Show when={items().length} fallback={<Show when={query()}><NoResults /></Show>}>
      <Section name={query() ? undefined : 'Recent'}>
        <For each={items()}>
          {(item, index) => (
            <ResultRow
              item={item}
              startsCategory={item.categoryLangKey !== items()[index() - 1]?.categoryLangKey}
              onSelect={props.onSelect}
            />
          )}
        </For>
      </Section>
    </Show>
  );
};

export default SettingsSearchResults;
