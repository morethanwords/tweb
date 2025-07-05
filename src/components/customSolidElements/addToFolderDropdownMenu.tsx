import {For, onCleanup, Show} from 'solid-js';
import {MiddlewareHelper} from '../../helpers/middleware';
import createMiddleware from '../../helpers/solid/createMiddleware';
import {i18n} from '../../lib/langPack';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE} from '../../lib/mtproto/mtproto_config';
import rootScope from '../../lib/rootScope';
import defineSolidElement, {PassedProps} from '../../lib/solidjs/defineSolidElement';
import {ButtonMenuItem} from '../buttonMenu';
import Scrollable from '../scrollable2';
import {getIconForFilter} from '../sidebarLeft/foldersSidebarContent/utils';
import wrapFolderTitle from '../wrappers/folderTitle';

import styles from './addToFolderDropdownMenu.module.scss';

if(import.meta.hot) import.meta.hot.accept();


type Props = {
  folders: FolderItem[];
  middleware: MiddlewareHelper;
};

type FolderItem = {
  id: number;
  icon: Icon;
  title: HTMLElement;
};

const MAX_VISIBLE_ITEMS = 8;

export async function fetchDialogFolders() {
  const filters = await rootScope.managers.filtersStorage.getDialogFilters();

  const necessaryFilters = filters
  .filter(filter => filter.id !== FOLDER_ID_ARCHIVE && filter.id !== FOLDER_ID_ALL)
  .sort((a, b) => {
    if(!a.id || !b.id) return 0;
    return a?.localId - b?.localId;
  });

  const middleware = createMiddleware();

  const folders = await Promise.all(
    necessaryFilters.map(async(filter): Promise<FolderItem> => ({
      id: filter.id,
      icon: getIconForFilter(filter),
      title: await wrapFolderTitle(filter.title, middleware.get()).then(fragment => {
        const span = document.createElement('span');
        span.append(fragment);
        return span;
      })
    }))
  );

  return {
    folders,
    middleware
  };
}

const AddToFolderDropdownMenu = defineSolidElement({
  name: 'add-to-folder-dropdown-menu',
  observedAttributes: ['size', 'something'],
  component: (props: PassedProps<Props>) => {
    props.element.classList.add('btn-menu', styles.Container);

    onCleanup(() => {
      props.middleware.destroy();
    });

    const visibleFolders = () => props.folders;

    const Content = () => <>
      <div class={styles.Label}>
        {i18n('AddToFolderSearch')}
        <input
          class={styles.Input}
          ref={el => {
            setTimeout(() => {
              el.focus();
            }, 100);
          }}
        />
      </div>

      <For each={visibleFolders()}>
        {(item) => ButtonMenuItem({
          icon: item.icon,
          textElement: item.title,
          onClick: () => void 0
        })}
      </For>
    </>;

    return (
      <Show when={visibleFolders().length > MAX_VISIBLE_ITEMS} fallback={<Content />}>
        <div class={styles.ScrollableContainer} style={{'--max-visible-items': MAX_VISIBLE_ITEMS}}>
          <Scrollable withBorders='both'>
            <Content />
          </Scrollable>
        </div>
      </Show>
    );
  }
});

export default AddToFolderDropdownMenu;
