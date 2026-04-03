import Badge from '@components/badge';
import Tabs from '@components/tabs';
import wrapFolderTitle from '@components/wrappers/folderTitle';
import documentFragmentToNodes from '@helpers/dom/documentFragmentToNodes';
import createMiddleware from '@helpers/solid/createMiddleware';
import {FOLDER_ID_ALL} from '@lib/appManagers/constants';
import {i18n} from '@lib/langPack';
import useFolders from '@stores/folders';
import {For} from 'solid-js';

export default function FoldersTabs(props: {
  scrollableProps?: Partial<Parameters<typeof Tabs.MenuScrollable>[0]>,
  menuProps?: Partial<Parameters<typeof Tabs.Menu>[0]>
}) {
  const {folderItems} = useFolders();

  const Tab = (item: typeof folderItems[0]) => {
    const title = () => {
      if(item.id === FOLDER_ID_ALL) {
        return i18n('FilterAllChatsShort');
      }

      const fragment = wrapFolderTitle(
        item.filter.title,
        createMiddleware().get(),
        true,
        {textColor: 'secondary-text-color'}
      );
      return documentFragmentToNodes(fragment);
    };

    return (
      <Tabs.MenuTab
        ref={(ref) => ref.dataset.filterId = '' + item.filter.id}
      >
        <span class="text-super">
          {title()}
        </span>
        <Badge
          tag="div"
          size={20}
          color={item.notifications.muted ? 'gray' : 'primary'}
        >
          {item.notifications.count}
        </Badge>
      </Tabs.MenuTab>
    );
  };

  return (
    <Tabs>
      <Tabs.MenuScrollable {...(props.scrollableProps || {})}>
        <Tabs.Menu {...(props.menuProps || {})}>
          <For each={folderItems}>{Tab}</For>
        </Tabs.Menu>
      </Tabs.MenuScrollable>
    </Tabs>
  );
}
