import {createEffect, onCleanup, Show} from 'solid-js';
import {Message} from '@layer';
import getMessageThreadId from '@appManagers/utils/messages/getMessageThreadId';
import {i18n} from '@lib/langPack';
import defineSolidElement, {PassedProps} from '@lib/solidjs/defineSolidElement';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {IconTsx} from '@components/iconTsx';
import classNames from '@helpers/string/classNames';
import ReplyMarkupLayout from '@components/chat/bubbleParts/replyMarkupLayout';
import type Chat from '@components/chat/chat';
import styles from '@components/chat/bubbleParts/continueLastTopicReplyMarkup/styles.module.scss';

if(import.meta.hot) import.meta.hot.accept();

type Props = {
  chat: Chat;
  message: Message.message;
  bubble: HTMLElement;
  visible?: boolean;
};

const ContinueLastTopicReplyMarkupContent = defineSolidElement({
  name: 'continue-last-topic-reply-markup-content',
  component: (props: PassedProps<Props>) => {
    const {appImManager} = useHotReloadGuard();

    const onClick = () => {
      const messageThreadId = getMessageThreadId(props.message, {isBotforum: props.chat.isBotforum});
      if(!messageThreadId) return;

      appImManager.setPeer({
        peerId: props.chat.peerId,
        threadId: messageThreadId
      });
    };

    createEffect(() => {
      if(!props.visible) return;
      props.bubble.classList.add('with-reply-markup');
      onCleanup(() => props.bubble.classList.remove('with-reply-markup'));
    });

    return (
      <Show when={props.visible}>
        <ReplyMarkupLayout>
          <ReplyMarkupLayout.Row>
            <ReplyMarkupLayout.Button textClass={classNames(styles.Button, 'reply-markup-suggested-action')} onClick={onClick}>
              {/* @once */i18n('ContinueLastTopic')}
              <IconTsx icon='arrowhead' class={styles.ArrowIcon} />
            </ReplyMarkupLayout.Button>
          </ReplyMarkupLayout.Row>
        </ReplyMarkupLayout>
      </Show>
    );
  }
});

export default ContinueLastTopicReplyMarkupContent;
