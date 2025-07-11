import {createComputed, createEffect, createMemo, createSelector, createSignal, For, onCleanup, Show} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {Transition} from 'solid-transition-group';
import assumeType from '../../helpers/assumeType';
import contextMenuController from '../../helpers/contextMenuController';
import {CLICK_EVENT_NAME} from '../../helpers/dom/clickEvent';
import noop from '../../helpers/noop';
import createMiddleware from '../../helpers/solid/createMiddleware';
import {Dialog} from '../../layer';
import {i18n} from '../../lib/langPack';
import {logger, LogTypes} from '../../lib/logger';
import rootScope from '../../lib/rootScope';
import defineSolidElement, {PassedProps} from '../../lib/solidjs/defineSolidElement';
import {AnyDialog} from '../../lib/storages/dialogs';
import {MyDialogFilter} from '../../lib/storages/filters';
import {ButtonMenuItem, ButtonMenuItemOptions} from '../buttonMenu';
import {IconTsx} from '../iconTsx';
import Scrollable from '../scrollable2';
import {getIconForFilter} from '../sidebarLeft/foldersSidebarContent/utils';
import showTooltip from '../tooltip';
import kindaFuzzyFinder from './kindaFuzzyFinder';
import styles from './styles.module.scss';
import {addToFilter, fetchDialogFilters, highlightTextNodes, removeFromFilter, wrapFolderTitleInSpan} from './utils';

if(import.meta.hot) import.meta.hot.accept();


const MAX_VISIBLE_SCROLL_ITEMS = 6;
const HAVE_SCROLL_WHEN_ABOVE = 8; // and search too
const MIN_FUZZY_SCORE = 0.25;

const log = logger('AddToFolderDropdownMenu', LogTypes.Debug);

/*
(this.filter as DialogFilter.dialogFilter)[this.type === 'included' ? 'includePeerIds' : 'excludePeerIds'] = peerIds;
(this.filter as DialogFilter.dialogFilter)[this.type === 'included' ? 'include_peers' : 'exclude_peers'] = await Promise.all(peerIds.map((peerId) => this.managers.appPeersManager.getInputPeerById(peerId)));

'checkround_filled' 'check' 'enter' 'info' 'info2'
*/

type Props = {
  dialog: AnyDialog; // TODO: What is the difference between Dialog And SavedDialog ??
  filters: MyDialogFilter[];
  onCleanup?: () => void;
  onNewDialog?: (dialog: AnyDialog) => void;
};


const AddToFolderDropdownMenu = defineSolidElement({
  name: 'add-to-folder-dropdown-menu',
  component: (props: PassedProps<Props>, _, controls: {closeTooltip: () => void}) => {
    props.element.classList.add('btn-menu', styles.Container);

    type FolderItem = ReturnType<typeof folderItems>[number];

    let infoIcon: HTMLElement, label: HTMLDivElement;
    const [search, setSearch] = createSignal('');
    const [selected, setSelected] = createSignal<number>();
    const [selectableFolders, setSelectableFolders] = createSignal<FolderItem[]>([]);

    const isInFilter = createSelector(() => props.dialog, (filter: MyDialogFilter, dialog) => {
      const key = `index_${filter.localId}` as const;
      assumeType<Dialog.dialog>(props.dialog);
      return !!props.dialog?.[key];
    });

    const selectedFilter = createMemo(() => selectableFolders()[selected()]?.filter);
    const isSelected = createSelector(() => selectedFilter()?.id);

    let hasRequestInProgress = false;

    async function toggleDialogInFilter(filter: MyDialogFilter) {
      if(hasRequestInProgress || !filter) return;

      assumeType<Dialog.dialog>(props.dialog);
      const unwrapped = unwrap(filter);

      hasRequestInProgress = true;

      try {
        await (isInFilter(filter) ? removeFromFilter(unwrapped, props.dialog.peerId) : addToFilter(unwrapped, props.dialog.peerId));
        const newDialog = await rootScope.managers.dialogsStorage.getAnyDialog(props.dialog.peerId);
        props.dialog = newDialog;
        props.onNewDialog?.(newDialog);
      } catch{} finally {
        hasRequestInProgress = false;
      }
    }

    const folderItems = createMemo(() => {
      const middleware = createMiddleware();
      log.debug('creating folder items');

      onCleanup(() => {
        log.debug('destroying folder items middleware');
        middleware.destroy();
      });

      return props.filters.map((filter) => {
        const {span, charSpansGroups} = wrapFolderTitleInSpan(filter.title, middleware.get());
        span.classList.add(styles.ItemLabelText);

        const options: ButtonMenuItemOptions = {
          iconElement: (
            <span class={`btn-menu-item-icon ${styles.ItemIcon}`}>
              <IconTsx icon={getIconForFilter(filter)} />
              <Transition
                enterActiveClass={styles.AppearZoomEnterActive}
                exitActiveClass={styles.AppearZoomEnterActive}
                enterClass={styles.AppearZoomEnter}
                exitToClass={styles.AppearZoomExitTo}
              >
                <Show when={isInFilter(filter)}>
                  <span class={styles.ItemIconCheck}>
                    <IconTsx icon='check' />
                  </span>
                </Show>
              </Transition>
            </span>
          ) as HTMLSpanElement,
          textElement: (
            <span class={styles.ItemLabel}>
              {span}
              <Show when={isSelected(filter.id)}>
                <IconTsx icon='enter' class={styles.ItemLabelEnter} />
              </Show>
            </span>
          ) as HTMLSpanElement,
          onClick: noop
        };

        const buttonMenuItem = ButtonMenuItem(options);

        options.element?.addEventListener(CLICK_EVENT_NAME, async(e) => {
          if(e.shiftKey) e.stopPropagation();
          toggleDialogInFilter(filter);
        }, true);
        options.element?.classList.add(styles.Item);

        createEffect(() => {
          if(!isSelected(filter.id)) return;
          options.element?.classList.add(styles.selected);
          onCleanup(() => void options.element?.classList.remove(styles.selected));
        });

        return {
          filter,
          textContent: span.textContent,
          buttonMenuItem,
          element: options.element,
          charSpansGroups
        };
      });
    });

    const renderedFolders = createMemo(() => {
      if(!search()) return {
        folders: folderItems(),
        visibleFoldersCount: folderItems().length
      };

      const fuzziedFolders = folderItems().map((src) => ({
        finderResult: kindaFuzzyFinder(src.textContent, search()),
        src
      }));

      const sortedFolders = fuzziedFolders
      .sort(({finderResult: {found: found1, score: score1}}, {finderResult: {found: found2, score: score2}}) =>
          score1 === score2 ? (found1[0] || 0) - (found2[0] || 0) : score2 - score1
      );

      setSelected(0);
      onCleanup(() => void setSelected());

      const visibleFoldersCount = sortedFolders.filter(({src, finderResult}) => {
        if(finderResult.score >= MIN_FUZZY_SCORE) {
          createEffect(() => {
            if(isSelected(src.filter.id)) src.element.scrollIntoView({block: 'center'});
          });

          highlightTextNodes(src.charSpansGroups, finderResult.found);

          return true;
        }

        src.buttonMenuItem.forEach(el => el.classList.add(styles.Hidden));
        onCleanup(() => void src.buttonMenuItem.forEach(el => el.classList.remove(styles.Hidden)))
      }).length;

      return {
        folders: sortedFolders.map(({src}) => src),
        visibleFoldersCount
      };
    });

    // Prevent calling renderedFolders before initialization
    createComputed(() => {
      setSelectableFolders(renderedFolders().folders);
    });

    createEffect(() => {
      if(typeof selected() !== 'number') label.scrollIntoView({block: 'center'});
    });


    let closeTooltip = noop;

    setTimeout(() => {
      closeTooltip = undefined;
    }, 200); // wait opening animation

    const onLabelPointerEnter = () => {
      if(closeTooltip) return;
      closeTooltip = showTooltip({
        element: infoIcon,
        vertical: 'top',
        textElement: i18n('AddToFolderTip'),
        lighter: true,
        auto: true,
        useOverlay: false,
        onClose: () => {
          closeTooltip = undefined;
        }
      }).close;
    };

    const onInputKeyDown = (e: KeyboardEvent) => {
      if(['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Enter'].includes(e.code)) e.preventDefault();

      if(e.code === 'Enter' && selectedFilter()) {
        toggleDialogInFilter(selectedFilter());
        if(!e.shiftKey) contextMenuController.close();
        return;
      }

      if(typeof selected() !== 'number') return;

      const increment = ['ArrowUp', 'ArrowLeft'].includes(e.code) ? -1 : ['ArrowDown', 'ArrowRight'].includes(e.code) ? 1 : 0;
      setSelected(prev => (prev + increment + renderedFolders().visibleFoldersCount) % renderedFolders().visibleFoldersCount)
    };

    controls.closeTooltip = () => {
      closeTooltip?.();
      closeTooltip = noop; // prevent further opening of the tooltip
    };

    onCleanup(() => {
      props.onCleanup?.();
      closeTooltip?.();
    });

    const Items = () => (
      <For each={renderedFolders().folders}>
        {(folder) => folder.buttonMenuItem}
      </For>
    );

    return (
      <Show when={props.filters.length > HAVE_SCROLL_WHEN_ABOVE} fallback={<Items />}>
        <div class={styles.ScrollableContainer} style={{'--max-visible-items': MAX_VISIBLE_SCROLL_ITEMS}}>
          <input
            class={styles.Input}
            value={search()}
            onInput={e => void setSearch(e.target.value)}
            onBlur={(e) => {
              e.target.focus();
            }}
            onKeyDown={onInputKeyDown}
            ref={el => {
              setTimeout(() => {
                el.focus();
              }, 100);
            }}
          />
          <Scrollable withBorders='both'>
            <div ref={label} class={styles.Label} onPointerEnter={onLabelPointerEnter}>
              {(() => {
                const el = i18n('AddToFolderSearch');
                el.classList.add(styles.LabelText);
                return el;
              })()}
              <IconTsx ref={infoIcon} icon='info' />
            </div>

            <Items />
          </Scrollable>
        </div>
      </Show>
    );
  }
});

export {fetchDialogFilters};
export default AddToFolderDropdownMenu;
