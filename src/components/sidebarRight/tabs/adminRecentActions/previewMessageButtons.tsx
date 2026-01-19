import {createMemo, Show} from 'solid-js';
import {I18nTsx} from '@helpers/solid/i18n';
import {Message} from '@layer';
import {MyMessage} from '@appManagers/appMessagesManager';
import {LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import Button from '@components/buttonTsx';
import styles from '@components/sidebarRight/tabs/adminRecentActions/previewMessageButtons.module.scss';


export const PreviewMessageButtons = (props: {
  channelId: ChatId;
  added?: Message;
  removed?: Message;

  addedKey?: LangPackKey;
  removedKey?: LangPackKey;
}) => {
  const {rootScope, appImManager, ChatType} = useHotReloadGuard();

  const getNonEmpty = (message: Message) => message && (message._ === 'message' || message._ === 'messageService') ? message : undefined;

  const nonEmptyAdded = createMemo(() => getNonEmpty(props.added));
  const nonEmptyRemoved = createMemo(() => getNonEmpty(props.removed));

  const onClick = async(message: MyMessage) => {
    const newMessage = await rootScope.managers.appMessagesManager.saveLogsMessage(props.channelId.toPeerId(true), message);

    appImManager.setPeer({
      peerId: props.channelId.toPeerId(true),
      messages: [newMessage],
      type: ChatType.Static
    });
  };

  return (
    <Show when={nonEmptyAdded() || nonEmptyRemoved()}>
      <div class={styles.Container}>
        <Show when={nonEmptyAdded() && props.addedKey}>
          <Button class={`interactable ${styles.Button} ${styles.added}`} onClick={() => onClick(nonEmptyAdded())}>
            <I18nTsx key={props.addedKey} />
          </Button>
        </Show>
        <Show when={nonEmptyRemoved() && props.removedKey}>
          <Button class={`interactable ${styles.Button} ${styles.removed}`} onClick={() => onClick(nonEmptyRemoved())}>
            <I18nTsx key={props.removedKey} />
          </Button>
        </Show>
      </div>
    </Show>
  );
};
