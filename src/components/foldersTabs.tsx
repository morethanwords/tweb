import Badge from '@components/badge';
import Tabs from '@components/tabs';
import FolderTitleTsx from '@components/folderTitleTsx';
import {FOLDER_ID_ALL} from '@lib/appManagers/constants';
import {i18n} from '@lib/langPack';
import useFolders from '@stores/folders';
import {For} from 'solid-js';

export default function FoldersTabs(props: {
  scrollableProps?: Partial<Parameters<typeof Tabs.MenuScrollable>[0]>,
  menuProps?: Partial<Parameters<typeof Tabs.Menu>[0]>,
  gradientProps?: Parameters<typeof Tabs.MenuGradient>[0]
}) {
  const {folderItems} = useFolders();

  const Tab = (item: typeof folderItems[0]) => {
    const title = () => {
      if(item.id === FOLDER_ID_ALL) {
        return i18n('FilterAllChatsShort');
      }

      return <FolderTitleTsx title={item.filter.title} textColor="secondary-text-color" />;
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
      {props.gradientProps && <Tabs.MenuGradient {...props.gradientProps} />}
      <Tabs.MenuScrollable {...(props.scrollableProps || {})}>
        <Tabs.Menu {...(props.menuProps || {})}>
          <For each={folderItems}>{Tab}</For>
        </Tabs.Menu>
      </Tabs.MenuScrollable>
    </Tabs>
  );
}
