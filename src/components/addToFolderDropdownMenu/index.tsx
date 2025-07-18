import {createComputed, createEffect, createMemo, createSelector, createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import {IS_MOBILE} from '../../environment/userAgent';
import {CLICK_EVENT_NAME} from '../../helpers/dom/clickEvent';
import {Dialog} from '../../layer';
import {i18n} from '../../lib/langPack';
import defineSolidElement, {PassedProps} from '../../lib/solidjs/defineSolidElement';
import {MyDialogFilter} from '../../lib/storages/filters';
import appNavigationController from '../appNavigationController';
import {IconTsx} from '../iconTsx';
import Scrollable from '../scrollable2';
import {createFolderItems, createSearchableFolders, FolderItem, useInputKeydown, useToggleDialogInFilter, useTooltipHint} from './hooks';
import styles from './styles.module.scss';
import {fetchDialogFilters} from './utils';

if(import.meta.hot) import.meta.hot.accept();


const MAX_VISIBLE_SCROLL_ITEMS = 6;
const HAVE_SCROLL_WHEN_ABOVE = 8; // and search too


type Props = {
  dialog: Dialog.dialog;
  filters: MyDialogFilter[];
  currentFilter: () => number;
  onCleanup?: () => void;
  onNewDialog?: (dialog: Dialog.dialog) => void;
};


const AddToFolderDropdownMenu = defineSolidElement({
  name: 'add-to-folder-dropdown-menu',
  component: (props: PassedProps<Props>, _, controls: {closeTooltip: () => void}) => {
    //
    props.element.classList.add('btn-menu', styles.Container);

    let infoIcon: HTMLElement, label: HTMLDivElement, thumb: HTMLDivElement;

    const [search, setSearch] = createSignal('');
    const [selected, setSelected] = createSignal<number>();
    const [selectableFolders, setSelectableFolders] = createSignal<FolderItem[]>([]);

    const isInFilter = createSelector(
      () => props.dialog,
      (filter: MyDialogFilter, dialog) => !!dialog?.[`index_${filter.localId}`]
    );

    const selectedFilter = createMemo(() => selectableFolders()[selected()]?.filter);
    const isSelected = createSelector(() => selectedFilter()?.id);

    const renderAsScrollable = createMemo(() => props.filters.length > HAVE_SCROLL_WHEN_ABOVE);

    const toggleDialogInFilter = useToggleDialogInFilter({
      dialog: () => props.dialog,
      onNewDialog: (newDialog) => {
        props.dialog = newDialog;
        props.onNewDialog?.(newDialog);
      },
      isInFilter
    });

    const folderItems = createFolderItems({
      filters: () => props.filters,
      isInFilter,
      isSelected,
      onToggle: toggleDialogInFilter,
      currentFilter: props.currentFilter
    });

    const searchableFolders = createSearchableFolders({
      folderItems,
      search,
      isSelected,
      setSelected
    });

    const {showHint, closeAndDisableTooltip} = useTooltipHint({pivot: () => infoIcon});
    controls.closeTooltip = closeAndDisableTooltip;

    const onInputKeyDown = useInputKeydown({
      search,
      setSearch,
      selected,
      setSelected,
      selectedFilter,
      currentFilter: props.currentFilter,
      onToggle: toggleDialogInFilter,
      visibleFoldersCount: () => searchableFolders().visibleFoldersCount
    });

    onMount(() => {
      thumb?.addEventListener(CLICK_EVENT_NAME, e => {
        e.stopPropagation();
      }, true);
    });

    // Prevent calling renderedFolders before initialization
    createComputed(() => {
      setSelectableFolders(searchableFolders().folders);
    });

    createEffect(() => {
      if(typeof selected() !== 'number') label?.scrollIntoView({block: 'center'});
    });

    createEffect(() => {
      props.element.classList.toggle(styles.withScrollable, renderAsScrollable());
    });

    const cleanupEscapeHandler = appNavigationController.registerEscapeHandler(() => !search());

    onCleanup(() => {
      props.onCleanup?.();
      cleanupEscapeHandler();
    });

    const Items = () => (
      <For each={searchableFolders().folders}>
        {(folder) => folder.buttonMenuItem}
      </For>
    );

    return (
      <Show when={renderAsScrollable()} fallback={<Items />}>
        <div
          class={styles.ScrollableContainer}
          classList={{
            [styles.mobile]: IS_MOBILE
          }}
          style={{'--max-visible-items': MAX_VISIBLE_SCROLL_ITEMS}}
        >
          <Show when={!IS_MOBILE}>
            <input
              class={styles.Input}
              value={search()}
              onInput={e => void setSearch(e.target.value)}
              onBlur={(e) => {
                e.target.focus();
              }}
              onKeyDown={onInputKeyDown}
              ref={el => void setTimeout(() => void el.focus(), 100)}
            />
          </Show>
          <Show when={!searchableFolders().visibleFoldersCount}>
            {(() => {
              const el = i18n('AddToFolderEmptySearchResult');
              el.classList.add(styles.EmptySearchTip);
              return el;
            })()}
          </Show>
          <Scrollable class={styles.Scrollable} thumbRef={(el) => void (thumb = el)}>
            <Show when={!IS_MOBILE}>
              <div ref={label} class={styles.Label} onPointerEnter={showHint}>
                {(() => {
                  const el = i18n('AddToFolderSearch');
                  el.classList.add(styles.LabelText);
                  return el;
                })()}
                <IconTsx ref={infoIcon} icon='info' />
              </div>
            </Show>

            <Items />
          </Scrollable>
        </div>
      </Show>
    );
  }
});

export {fetchDialogFilters};
export default AddToFolderDropdownMenu;
