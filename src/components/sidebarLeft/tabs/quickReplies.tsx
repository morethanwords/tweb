import styles from './quickReplies.module.scss';
import Section from '@components/section';
import Row from '@components/rowTsx';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import {createEffect, createResource, For, Show} from 'solid-js';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import showQuickReplyEditPopup from '@components/popups/quickReplyEdit';
import confirmationPopup from '@components/confirmationPopup';
import {QuickReply} from '@lib/quickReplies/types';

export default function QuickReplies() {
  const [tab] = useSuperTab();
  const [replies, {refetch}] = createResource(() => rootScope.managers.appQuickRepliesManager.getQuickReplies());

  createEffect(() => {
    tab.listenerSetter.add(rootScope)('quick_replies_update', () => refetch());
  });

  const add = () => showQuickReplyEditPopup();
  const edit = (reply: QuickReply) => showQuickReplyEditPopup({reply});

  const remove = async(reply: QuickReply) => {
    try {
      await confirmationPopup({
        titleLangKey: 'QuickReplies.DeleteTitle',
        descriptionLangKey: 'QuickReplies.DeleteConfirm',
        descriptionLangArgs: [reply.title],
        button: {langKey: 'Delete', isDanger: true}
      });
    } catch{
      return;
    }
    rootScope.managers.appQuickRepliesManager.deleteQuickReply(reply.id);
  };

  return (
    <Section name="QuickReplies.Title" caption="QuickReplies.Caption">
      <Row clickable={add} color="primary">
        <Row.Icon icon="add" />
        <Row.Title>{i18n('QuickReplies.Add')}</Row.Title>
      </Row>

      <Show
        when={replies()?.length}
        fallback={<div class={styles.empty}>{i18n('QuickReplies.EmptyHint')}</div>}
      >
        <For each={replies()}>
          {(reply) => (
            <Row clickable={() => edit(reply)}>
              <Row.Title>{reply.title}</Row.Title>
              <Row.Subtitle>{reply.text}</Row.Subtitle>
              <Row.RightContent>
                <ButtonIconTsx
                  icon="delete"
                  class={styles.delete}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(reply);
                  }}
                />
              </Row.RightContent>
            </Row>
          )}
        </For>
      </Show>
    </Section>
  );
}
