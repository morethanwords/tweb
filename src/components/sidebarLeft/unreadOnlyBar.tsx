import Button from '@components/buttonTsx';
import {IconTsx} from '@components/iconTsx';
import RippleElement from '@components/rippleElement';
import collapsedPanelStyles from '@components/sidebarLeft/collapsedPanelButton.module.scss';
import styles from '@components/sidebarLeft/unreadOnlyBar.module.scss';
import Modes from '@config/modes';
import classNames from '@helpers/string/classNames';
import I18n, {i18n} from '@lib/langPack';
import {useIsSidebarCollapsed} from '@stores/foldersSidebar';
import {Accessor, Show} from 'solid-js';
import {render} from 'solid-js/web';

/**
 * Says over the chat list that it shows only unread chats, and takes it back to every chat. It
 * comes and goes at its full height, with the rows it tells about (`shown`), so the list under it
 * is never seen moving - whoever shows it fades `toElement`
 */
export function renderUnreadOnlyBar(toElement: HTMLElement, props: {
  shown: Accessor<boolean>,
  onShowAll: () => void
}) {
  return render(() => {
    const [isSidebarCollapsed] = useIsSidebarCollapsed();
    const showAllLabel = () => I18n.format('ChatList.ShowAllChats', true);

    return (
      <Show when={props.shown()}>
        <div class={styles.container}>
          <Show
            when={!isSidebarCollapsed()}
            fallback={
              <RippleElement
                component="button"
                type="button"
                class={classNames(collapsedPanelStyles.button, 'hover-effect')}
                tabIndex={Modes.a11y ? undefined : -1}
                aria-label={showAllLabel()}
                onClick={() => props.onShowAll()}
              >
                <IconTsx icon="unread" class={styles.collapsedIcon} />
              </RippleElement>
            }
          >
            <div class={styles.bar}>
              <IconTsx icon="unread" class={styles.icon} />
              <span class={styles.title}>{i18n('ChatList.UnreadOnly.Title')}</span>
              <Button.Icon
                icon="close"
                class={styles.close}
                aria-label={showAllLabel()}
                onClick={() => props.onShowAll()}
              />
            </div>
          </Show>
        </div>
      </Show>
    );
  }, toElement);
}
