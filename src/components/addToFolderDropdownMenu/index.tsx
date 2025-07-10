import {createMemo, createSignal, For, onCleanup, Show} from 'solid-js';
import createMiddleware from '../../helpers/solid/createMiddleware';
import {i18n} from '../../lib/langPack';
import {logger, LogTypes} from '../../lib/logger';
import defineSolidElement, {PassedProps} from '../../lib/solidjs/defineSolidElement';
import {MyDialogFilter} from '../../lib/storages/filters';
import {ButtonMenuItem} from '../buttonMenu';
import Icon from '../icon';
import {IconTsx} from '../iconTsx';
import Scrollable from '../scrollable2';
import {getIconForFilter} from '../sidebarLeft/foldersSidebarContent/utils';
import showTooltip from '../tooltip';
import kindaFuzzyFinder from './kindaFuzzyFinder';
import styles from './styles.module.scss';
import {fetchDialogFilters, highlightTextNodes, wrapFolderTitleInSpan} from './utils';

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
  filters: MyDialogFilter[];
  onCleanup?: () => void;
};

const AddToFolderDropdownMenu = defineSolidElement({
  name: 'add-to-folder-dropdown-menu',
  component: (props: PassedProps<Props>, _, controls: {closeTooltip: () => void}) => {
    props.element.classList.add('btn-menu', styles.Container);

    let infoIcon: HTMLElement, label: HTMLDivElement;
    const [search, setSearch] = createSignal('');

    const folderItems = createMemo(() => {
      const middleware = createMiddleware();
      log.debug('creating folder items');

      onCleanup(() => {
        log.debug('destroying folder items middleware');
        middleware.destroy();
      });

      return props.filters.map(filter => {
        const {span, charSpansGroups} = wrapFolderTitleInSpan(filter.title, middleware.get());

        return {
          textContent: span.textContent,
          buttonMenuItem: ButtonMenuItem({
            iconElement: Icon(getIconForFilter(filter), 'btn-menu-item-icon'),
            textElement: span,
            onClick: () => void 0
          }),
          charSpansGroups
        };
      });
    });

    const visibleFolders = createMemo(() => {
      if(!search()) return folderItems();

      const fuzziedFolders = folderItems().map((src) => ({
        finderResult: kindaFuzzyFinder(src.textContent, search()),
        src
      }));

      const sortedFolders = fuzziedFolders
      .sort(({finderResult: {found: found1, score: score1}}, {finderResult: {found: found2, score: score2}}) =>
          score1 === score2 ? (found1[0] || 0) - (found2[0] || 0) : score2 - score1
      );

      return sortedFolders.map(({src, finderResult}) => {
        if(finderResult.score < MIN_FUZZY_SCORE) {
          src.buttonMenuItem.forEach(el => el.classList.add(styles.Hidden));
          onCleanup(() => void src.buttonMenuItem.forEach(el => el.classList.remove(styles.Hidden)))
        }

        highlightTextNodes(src.charSpansGroups, finderResult.found);

        return src;
      });
    });


    let closeTooltip = () => {};

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

    controls.closeTooltip = () => {
      closeTooltip?.();
    };

    onCleanup(() => {
      props.onCleanup?.();
      closeTooltip?.();
    });

    const Items = () => (
      <For each={visibleFolders()}>
        {(folder) => folder.buttonMenuItem}
      </For>
    );

    return (
      <Show when={props.filters.length > HAVE_SCROLL_WHEN_ABOVE} fallback={<Items />}>
        <div class={styles.ScrollableContainer} style={{'--max-visible-items': MAX_VISIBLE_SCROLL_ITEMS}}>
          <Scrollable withBorders='both'>
            <div ref={label} class={styles.Label} onPointerEnter={onLabelPointerEnter}>
              {(() => {
                const el = i18n('AddToFolderSearch');
                el.classList.add(styles.LabelText);
                return el;
              })()}
              <IconTsx ref={infoIcon} icon='info' />
              <input
                class={styles.Input}
                value={search()}
                onInput={e => void setSearch(e.target.value)}
                onBlur={(e) => {
                  e.target.focus();
                }}
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

export {fetchDialogFilters};
export default AddToFolderDropdownMenu;
