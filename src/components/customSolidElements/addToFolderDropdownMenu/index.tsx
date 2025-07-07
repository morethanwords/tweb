import {Accessor, createComputed, createEffect, createResource, createSignal, For, onCleanup, Show} from 'solid-js';
import createMiddleware from '../../../helpers/solid/createMiddleware';
import {TextWithEntities} from '../../../layer';
import {i18n} from '../../../lib/langPack';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE} from '../../../lib/mtproto/mtproto_config';
import rootScope from '../../../lib/rootScope';
import defineSolidElement, {PassedProps} from '../../../lib/solidjs/defineSolidElement';
import {MyDialogFilter} from '../../../lib/storages/filters';
import {ButtonMenuItem} from '../../buttonMenu';
import Scrollable from '../../scrollable2';
import {getIconForFilter} from '../../sidebarLeft/foldersSidebarContent/utils';
import wrapFolderTitle from '../../wrappers/folderTitle';
import kindaFuzzyFinder from './kindaFuzzyFinder';
import styles from './styles.module.scss';

if(import.meta.hot) import.meta.hot.accept();


type Props = {
  filters: MyDialogFilter[];
};

const MAX_VISIBLE_SCROLL_ITEMS = 6;
const HAVE_SCROLL_WHEN_ABOVE = 8;

function highlightTextNodes(node: Node, indicies: number[]) {
  const treeWalker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);

  const nodes: Node[] = [];

  while(treeWalker.nextNode()) {
    const node = treeWalker.currentNode;
    nodes.push(node);
  }

  let acc = 0;

  for(const node of nodes) {
    const n = node.nodeValue.length;
    const str = node.nodeValue;

    const localIndicies = indicies.filter(i => i >= acc && i < acc + n).map(i => i - acc);
    acc += n;

    const fragment = document.createDocumentFragment();
    let prevli = -1, highlight: HTMLElement;

    for(const li of localIndicies) {
      fragment.append(str.slice(prevli + 1, li));

      if(prevli === -1 || prevli + 1 < li) {
        highlight = makeHighlight();
      }
      highlight.textContent += str[li];
      prevli = li;
    }

    fragment.append(str.slice(prevli + 1, n));

    node.parentNode.replaceChild(fragment, node);

    function makeHighlight() {
      const el = document.createElement('span');
      el.style.background = 'green';
      fragment.append(el);
      return el;
    }
  }
}

export async function fetchDialogFilters() {
  const filters = await rootScope.managers.filtersStorage.getDialogFilters();

  return filters
  .filter(filter => filter.id !== FOLDER_ID_ARCHIVE && filter.id !== FOLDER_ID_ALL)
  .sort((a, b) => {
    if(!a.id || !b.id) return 0;
    return a?.localId - b?.localId;
  });
}

const AddToFolderDropdownMenu = defineSolidElement({
  name: 'add-to-folder-dropdown-menu',
  observedAttributes: ['size', 'something'],
  component: (props: PassedProps<Props>) => {
    props.element.classList.add('btn-menu', styles.Container);

    const [search, setSearch] = createSignal('');
    const visibleFolders = () => props.filters;

    const Content = () => <>
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

      <For each={visibleFolders()}>
        {
          (filter) => (
            ButtonMenuItem({
              icon: getIconForFilter(filter),
              textElement: createFolderTitle(filter.title, search),
              onClick: () => void 0
            })
          )
        }
      </For>
    </>;

    return (
      <Show when={visibleFolders().length > HAVE_SCROLL_WHEN_ABOVE} fallback={<Content />}>
        <div class={styles.ScrollableContainer} style={{'--max-visible-items': MAX_VISIBLE_SCROLL_ITEMS}}>
          <Scrollable withBorders='both'>
            <Content />
          </Scrollable>
        </div>
      </Show>
    );
  }
});

function createFolderTitle(title: TextWithEntities.textWithEntities, search: Accessor<string>) {
  const middleware = createMiddleware();

  let span: HTMLSpanElement;

  createComputed(() => {
    search();
    span?.replaceChildren();
  });

  const [richText] = createResource(search, () => wrapFolderTitle(title, middleware.get()));

  createEffect(() => {
    if(!richText() || !span || !search()) return;

    const {found} = kindaFuzzyFinder(span.textContent, search());
    highlightTextNodes(span, found);
  });

  console.log('[my-debug] creating FolderTitle');

  onCleanup(() => {
    console.log('[my-debug] destroying FolderTitle');
    middleware.destroy();
  });

  return <span ref={span}>{richText()}</span> as HTMLSpanElement;
}


export default AddToFolderDropdownMenu;
