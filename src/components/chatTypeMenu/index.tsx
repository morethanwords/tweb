import {createEffect, createMemo, createRenderEffect, onCleanup} from 'solid-js';
import type {RequestHistoryOptions} from '../../lib/appManagers/appMessagesManager';
import {i18n, LangPackKey} from '../../lib/langPack';
import defineSolidElement, {PassedProps} from '../../lib/solidjs/defineSolidElement';
import {ButtonMenuItemOptions} from '../buttonMenu';
import ButtonMenuToggle from '../buttonMenuToggle';
import styles from './styles.module.scss';

if(import.meta.hot) import.meta.hot.accept();


type ChatType = RequestHistoryOptions['chatType'];

type Props = {
  selected?: ChatType;
  hidden?: boolean;
  onChange?: (type: ChatType) => void;
};

const langKeyMap: Record<ChatType, LangPackKey> = {
  'all': 'AllChats',
  'users': 'UsersOnly',
  'groups': 'GroupsOnly',
  'channels': 'ChannelsOnly'
};

const keys: ChatType[] = ['all', 'users', 'groups', 'channels'];

const ChatTypeMenu = defineSolidElement({
  name: 'chat-type-menu',
  component: (props: PassedProps<Props>) => {
    const selected = createMemo(() => props.selected || 'all');

    const options: ButtonMenuItemOptions[] = keys.map(key => ({
      id: key,
      emptyIcon: true,
      text: langKeyMap[key],
      onClick: () => {
        props.selected = key;
        props.onChange?.(key);
      }
    }));

    createEffect(() => {
      const option = options.find(({id}) => id === selected());
      if(!option) return;

      option.icon = 'check';
      onCleanup(() => {
        option.icon = undefined;
      });
    });

    const span = <span
      class={`primary checkable-button-menu ${styles.ButtonMenu}`}
      classList={{
        [styles.hidden]: !!props.hidden
      }}
    >{i18n(langKeyMap[selected()])}</span> as HTMLSpanElement;

    const buttonMenu = ButtonMenuToggle({
      container: span,
      buttons: options,
      direction: 'bottom-left',
      onOpen: (_, element) => {
        element.style.bottom = 'unset';
      }
    });

    return <>{buttonMenu}</>;
  }
});

export default ChatTypeMenu;
