import {createMemo, createSignal, For, onCleanup, Show} from 'solid-js';
import {Middleware} from '../../../helpers/middleware';
import createMiddleware from '../../../helpers/solid/createMiddleware';
import {TextWithEntities} from '../../../layer';
import {i18n} from '../../../lib/langPack';
import {logger, LogTypes} from '../../../lib/logger';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE} from '../../../lib/mtproto/mtproto_config';
import rootScope from '../../../lib/rootScope';
import defineSolidElement, {PassedProps} from '../../../lib/solidjs/defineSolidElement';
import {MyDialogFilter} from '../../../lib/storages/filters';
import {ButtonMenuItem} from '../../buttonMenu';
import Scrollable from '../../scrollable2';
import {getIconForFilter} from '../../sidebarLeft/foldersSidebarContent/utils';
import wrapFolderTitle from '../../wrappers/folderTitle';
import highlightTextNodes from './highlightTextNodes';
import kindaFuzzyFinder from './kindaFuzzyFinder';
import styles from './styles.module.scss';

if(import.meta.hot) import.meta.hot.accept();


type Props = {
  filters: MyDialogFilter[];
};

const MAX_VISIBLE_SCROLL_ITEMS = 6;
const HAVE_SCROLL_WHEN_ABOVE = 8;
const MIN_FUZZY_SCORE = 0.25;


const log = logger('AddToFolderDropdownMenu', LogTypes.Debug);

export async function fetchDialogFilters() {
  const filters = await rootScope.managers.filtersStorage.getDialogFilters();

  return filters
  .filter(filter => filter.id !== FOLDER_ID_ARCHIVE && filter.id !== FOLDER_ID_ALL)
  .sort((a, b) => {
    if(!a.id || !b.id) return 0;
    return a?.localId - b?.localId;
  });
}

function wrapFolderTitleInSpan(title: TextWithEntities.textWithEntities, middleware: Middleware) {
  const span: HTMLSpanElement = document.createElement('span');
  const fragment = wrapFolderTitle(title, middleware, true);

  span.append(fragment);
  return span;
}

const AddToFolderDropdownMenu = defineSolidElement({
  name: 'add-to-folder-dropdown-menu',
  component: (props: PassedProps<Props>) => {
    props.element.classList.add('btn-menu', styles.Container);

    const [search, setSearch] = createSignal('');

    const createFolderItems = () => {
      const middleware = createMiddleware();
      log.debug('creating folder items');

      onCleanup(() => {
        log.debug('destroying folder items middleware');
        middleware.destroy();
      });

      return props.filters.map(filter => ({
        filter,
        icon: getIconForFilter(filter),
        element: wrapFolderTitleInSpan(filter.title, middleware.get())
      }));
    };

    const visibleFolders = createMemo(() => {
      if(!search()) return createFolderItems();

      const fuzziedFolders = createFolderItems().map((src) => ({
        finderResult: kindaFuzzyFinder(src.element.textContent, search()),
        src
      }));

      const sortedFolders = fuzziedFolders
      .filter(({finderResult}) => finderResult.score >= MIN_FUZZY_SCORE)
      .sort(({finderResult: {found: found1, score: score1}}, {finderResult: {found: found2, score: score2}}) =>
          score1 === score2 ? (found1[0] || 0) - (found2[0] || 0) : score2 - score1
      );

      return sortedFolders.map(({src, finderResult}) => {
        highlightTextNodes(src.element, finderResult.found);
        return src;
      });
    });

    const Items = () => (
      <For each={visibleFolders()}>
        {
          (folder) => (
            ButtonMenuItem({
              icon: folder.icon,
              textElement: folder.element,
              onClick: () => void 0
            })
          )
        }
      </For>
    );

    return (
      <Show when={props.filters.length > HAVE_SCROLL_WHEN_ABOVE} fallback={<Items />}>
        <div class={styles.ScrollableContainer} style={{'--max-visible-items': MAX_VISIBLE_SCROLL_ITEMS}}>
          <Scrollable withBorders='both'>
            <div class={styles.Label}>
              {i18n('AddToFolderSearch')}
              <input
                class={styles.Input}
                value={search()}
                onInput={e => void setSearch(e.target.value)}
                ref={el => {
                  setTimeout(() => {
                    el.focus();
                  }, 100);
                }}
              />
            </div>

            <Items />
          </Scrollable>
        </div>
      </Show>
    );
  }
});

export default AddToFolderDropdownMenu;
