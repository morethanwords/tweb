import {Accessor, createEffect, createMemo, createSignal, JSX, onCleanup, Setter, Show} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {Transition} from 'solid-transition-group';
import contextMenuController from '../../helpers/contextMenuController';
import {CLICK_EVENT_NAME} from '../../helpers/dom/clickEvent';
import noop from '../../helpers/noop';
import createMiddleware from '../../helpers/solid/createMiddleware';
import {Dialog} from '../../layer';
import {isDialog} from '../../lib/appManagers/utils/dialogs/isDialog';
import {i18n} from '../../lib/langPack';
import rootScope from '../../lib/rootScope';
import {MyDialogFilter} from '../../lib/storages/filters';
import {ButtonMenuItem, ButtonMenuItemOptions} from '../buttonMenu';
import {IconTsx} from '../iconTsx';
import extractEmojiFromFilterTitle from '../sidebarLeft/foldersSidebarContent/extractEmojiFromFilterTitle';
import FolderAnimatedIcon from '../sidebarLeft/foldersSidebarContent/folderAnimatedIcon';
import {getIconForFilter} from '../sidebarLeft/foldersSidebarContent/utils';
import showTooltip from '../tooltip';
import kindaFuzzyFinder from './kindaFuzzyFinder';
import styles from './styles.module.scss';
import {addToFilter, highlightTextNodes, log, removeFromFilter, wrapFolderTitleInSpan} from './utils';


const MIN_FUZZY_SCORE = 0.25;


type CreateButtonMenuIconArgs = {
  filter: MyDialogFilter;
  isChecked: Accessor<boolean>;
  docId?: DocId;
  emoji?: string;
}

export const createButtonMenuIcon = ({filter, isChecked, docId, emoji}: CreateButtonMenuIconArgs) => {
  const [failedToFetchIcon, setFailedToFetchIcon] = createSignal(false);

  return (
    <span class={`btn-menu-item-icon ${styles.ItemIcon}`}>
      <Show
        when={(docId || emoji) && !failedToFetchIcon()}
        fallback={<IconTsx icon={getIconForFilter(filter)} />}
      >
        <FolderAnimatedIcon
          managers={rootScope.managers}
          color='primary-text-color'
          docId={docId}
          emoji={emoji}
          size={20}
          onFail={() => setFailedToFetchIcon(true)}
          dontAnimate={filter.pFlags?.title_noanimate}
        />
      </Show>
      <Transition
        enterActiveClass={styles.AppearZoomEnterActive}
        exitActiveClass={styles.AppearZoomEnterActive}
        enterClass={styles.AppearZoomEnter}
        exitToClass={styles.AppearZoomExitTo}
      >
        <Show when={isChecked()}>
          <span class={styles.ItemIconCheck}>
            <IconTsx icon='check' />
          </span>
        </Show>
      </Transition>
    </span>
  ) as HTMLSpanElement
};


type CreateButtonMenuLabelArgs = {
  label: JSX.Element;
  isSelected: Accessor<boolean>;
};

export const createButtonMenuLabel = ({label, isSelected}: CreateButtonMenuLabelArgs) => (
  <span class={styles.ItemLabel}>
    {label}
    <Show when={isSelected()}>
      <IconTsx icon='enter' class={styles.ItemLabelEnter} />
    </Show>
  </span>
) as HTMLSpanElement;


type CreateFolderItemsArgs = {
  filters: Accessor<MyDialogFilter[]>;
  currentFilter: Accessor<number>;
  isInFilter: (filter: MyDialogFilter) => boolean;
  isSelected: (filterId: number) => boolean;
  onToggle: (filter: MyDialogFilter) => void;
};

export type FolderItem = ReturnType<ReturnType<typeof createFolderItems>>[number];

export const createFolderItems = ({filters, isInFilter, isSelected, onToggle, currentFilter}: CreateFolderItemsArgs) => createMemo(() => {
  const middleware = createMiddleware();
  log.debug('creating folder items');

  onCleanup(() => {
    log.debug('destroying folder items middleware');
    middleware.destroy();
  });

  return filters().map((filter) => {
    const extractedTitle = extractEmojiFromFilterTitle(filter.title);
    const {span, charSpansGroups} = wrapFolderTitleInSpan(extractedTitle.text, middleware.get());
    span.classList.add(styles.ItemLabelText);

    const options: ButtonMenuItemOptions = {
      iconElement: createButtonMenuIcon({filter, isChecked: () => isInFilter(filter), docId: extractedTitle.docId, emoji: extractedTitle.emoji}),
      textElement: createButtonMenuLabel({label: span, isSelected: () => isSelected(filter.id)}),
      onClick: noop
    };

    const buttonMenuItem = ButtonMenuItem(options);

    options.element?.addEventListener(CLICK_EVENT_NAME, async(e) => {
      if(e.shiftKey && currentFilter() !== filter.id) e.stopPropagation();
      onToggle(filter);
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


type UseToggleDialogInFilterArgs = {
  dialog: Accessor<Dialog.dialog>;
  isInFilter: (filter: MyDialogFilter) => boolean;
  onNewDialog: (dialog: Dialog.dialog) => void;
};

export const useToggleDialogInFilter = ({dialog, onNewDialog, isInFilter}: UseToggleDialogInFilterArgs) => {
  let hasRequestInProgress = false;

  return async(filter: MyDialogFilter) => {
    if(hasRequestInProgress || !filter) return;

    const unwrapped = unwrap(filter);

    hasRequestInProgress = true;

    try {
      await (isInFilter(filter) ? removeFromFilter(unwrapped, dialog().peerId) : addToFilter(unwrapped, dialog().peerId));
      const newDialog = await rootScope.managers.dialogsStorage.getAnyDialog(dialog().peerId);
      if(!isDialog(newDialog)) return;
      onNewDialog(newDialog);
    } catch{} finally {
      hasRequestInProgress = false;
    }
  }
};


type CreateSearchableFoldersArgs = {
  folderItems: Accessor<FolderItem[]>;
  search: Accessor<string>;
  isSelected: (filterId: number) => boolean;
  setSelected: (idx?: number) => void;
};

export const createSearchableFolders = ({folderItems, search, isSelected, setSelected}: CreateSearchableFoldersArgs) => createMemo(() => {
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


type UseTooltipHintArgs = {
  pivot: Accessor<HTMLElement>;
};

export const useTooltipHint = ({pivot}: UseTooltipHintArgs) => {
  let closeTooltip = noop;

  setTimeout(() => {
    closeTooltip = undefined;
  }, 200); // wait opening animation

  onCleanup(() => {
    closeTooltip?.();
  });

  const showHint = () => {
    if(closeTooltip) return;
    closeTooltip = showTooltip({
      element: pivot(),
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

  const closeAndDisableTooltip = () => {
    closeTooltip?.();
    closeTooltip = noop; // prevent further opening of the tooltip
  };

  return {
    showHint,
    closeAndDisableTooltip
  }
};


type UseInputKeydownArgs = {
  search: Accessor<string>;
  setSearch: Setter<string>
  selected: Accessor<number>;
  setSelected: Setter<number>;
  selectedFilter: Accessor<MyDialogFilter>;
  currentFilter: Accessor<number>;
  onToggle: (filter: MyDialogFilter) => void;
  visibleFoldersCount: Accessor<number>;
};

export const useInputKeydown = ({search, setSearch, selected, setSelected, selectedFilter, currentFilter, onToggle, visibleFoldersCount}: UseInputKeydownArgs) => {
  return (e: KeyboardEvent) => {
    if(['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Enter'].includes(e.code)) e.preventDefault();

    if(e.code === 'Escape') {
      if(search()) setSearch('');
      else contextMenuController.close();
    }

    if(e.code === 'Enter' && selectedFilter()) {
      onToggle(selectedFilter());
      if(!e.shiftKey || currentFilter() === selectedFilter().id) contextMenuController.close();
      return;
    }

    if(typeof selected() !== 'number') return;

    const increment = ['ArrowUp', 'ArrowLeft'].includes(e.code) ? -1 : ['ArrowDown', 'ArrowRight'].includes(e.code) ? 1 : 0;
    setSelected(prev => (prev + increment + visibleFoldersCount()) % visibleFoldersCount())
  };
};
