import {createEffect, createMemo, createSignal, For, on, Show} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
import {I18nTsx} from '../../../helpers/solid/i18n';
import {Message, MessageMedia, TodoCompletion} from '../../../layer'
import wrapRichText from '../../../lib/richTextProcessor/wrapRichText';

import styles from './checklist.module.scss';
import CheckboxFieldTsx from '../../checkboxFieldTsx';
import cancelEvent from '../../../helpers/dom/cancelEvent';
import rootScope from '../../../lib/rootScope';
import Chat from '../chat';
import {AvatarNewTsx} from '../../avatarNew';
import classNames from '../../../helpers/string/classNames';
import {PeerTitleTsx} from '../../peerTitleTsx';
import {IconTsx} from '../../iconTsx';
import {wrapEmojiTextWithEntities} from '../../../lib/richTextProcessor/wrapEmojiText';
import PopupPremium from '../../popups/premium';
import {toastNew} from '../../toast';
import wrapPeerTitle from '../../wrappers/peerTitle';

export function ChecklistBubble(props: {
  out: boolean
  message: Message.message & {media: MessageMedia.messageMediaToDo}
  chat: Chat
  richTextOptions: Parameters<typeof wrapRichText>[1]
}) {
  const [checklist, setChecklist] = createStore(props.message.media);

  createEffect(on(() => props.message.media, (value) => {
    setChecklist(reconcile(value));
  }))

  const completionsById = createMemo(() => {
    const results: Record<number, TodoCompletion> = {};
    for(const item of checklist.completions ?? []) {
      results[item.id] = item;
    }
    return results;
  })

  const isGroupChecklist = checklist.todo.pFlags.others_can_complete
  const isReadonly = props.message.fwd_from || !props.out && !isGroupChecklist;

  async function handleClick(id: number) {
    if(props.message.fwd_from) {
      toastNew({
        langPackKey: 'ChecklistReadonlyForwarded'
      })
      return
    }

    if(isReadonly) {
      toastNew({
        langPackKey: 'ChecklistReadonlyPersonal',
        langPackArguments: [
          await wrapPeerTitle({peerId: props.message.fromId})
        ]
      })
      return;
    }

    if(!rootScope.premium) {
      PopupPremium.show();
      return;
    }

    const wasCompleted = completionsById()[id];

    rootScope.managers.appMessagesManager.updateTodo({
      peerId: props.chat.peerId,
      mid: props.message.mid,
      taskId: id,
      action: wasCompleted ? 'uncomplete' : 'complete'
    })
  }

  return (
    <div class={styles.wrap}>
      <div class={styles.title}>
        {wrapEmojiTextWithEntities(checklist.todo.title)}
      </div>
      <I18nTsx
        key={isGroupChecklist ? 'GroupChecklist' : 'Checklist'}
        class={styles.subtitle}
      />
      <div class={styles.list}>
        <For each={checklist.todo.list}>
          {(item) => {
            const [completedById, setCompletedById] = createSignal<PeerId>(0);
            createEffect(() => {
              const completion = completionsById()[item.id];
              if(completion) {
                setCompletedById(completion.completed_by.toPeerId());
              }
            })

            return (
              <div
                class={classNames(
                  styles.item,
                  isReadonly ? styles.itemReadonly : styles.itemClickable,
                  completionsById()[item.id] && styles.itemCompleted,
                )}
                onClick={(evt) => {
                  cancelEvent(evt);
                  handleClick(item.id);
                }}
                data-checklist-item-id={item.id}
              >
                {isReadonly ? (
                  <div class={styles.itemIcon}>
                    {completionsById()[item.id] ? (
                      <IconTsx icon='check1'/>
                    ) : (
                      <div class={styles.itemIconDot}/>
                    )}
                  </div>
                ) : (
                  <div class={styles.itemCheckbox}>
                    <CheckboxFieldTsx
                      checked={Boolean(completionsById()[item.id])}
                    />
                    <AvatarNewTsx
                      peerId={completedById()}
                      size={22}
                    />
                  </div>
                )}
                <div class={styles.itemTitle}>
                  <span class={styles.itemTitleText}>{wrapEmojiTextWithEntities(item.title)}</span>
                  <Show when={isGroupChecklist && completionsById()[item.id]} keyed>
                    {(it) => (
                      <PeerTitleTsx
                        class={styles.itemCompletedBy}
                        peerId={it.completed_by.toPeerId()}
                        onlyFirstName
                      />
                    )}
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>
      <div class={styles.completed}>
        <I18nTsx
          key="ChecklistCompleted"
          args={[String(checklist.completions?.length ?? 0), String(checklist.todo.list.length)]}
        />
      </div>
    </div>
  )
}
