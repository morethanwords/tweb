import {children, createMemo, For, JSX, Show} from 'solid-js';
import {IconTsx} from '@components/iconTsx';
import styles from '@components/sidebarRight/tabs/adminRecentActions/logDiff.module.scss';


type LogDiffProps = {
  added?: JSX.Element;
  removed?: JSX.Element;

  vertical?: boolean;
};

export const LogDiff = (props: LogDiffProps) => {
  const resolvedAdded = children(() => props.added);
  const resolvedRemoved = children(() => props.removed);

  const addedAsArray = createMemo(() => resolvedAdded.toArray().filter(Boolean));
  const removedAsArray = createMemo(() => resolvedRemoved.toArray().filter(Boolean));

  const hasAdded = createMemo(() => addedAsArray().length > 0);
  const hasRemoved = createMemo(() => removedAsArray().length > 0);

  return (
    <div class={styles.Container} classList={{[styles.vertical]: props.vertical, interactable: !props.vertical}}>
      <Show when={hasAdded()}>
        <div class={`${styles.Block} ${styles.added}`} classList={{
          [props.vertical ? styles.unroundedRight : styles.unroundedBottom]: hasRemoved()
        }}>
          <div class={`${styles.Border} ${styles.added}`} />
          <For each={addedAsArray()}>
            {item => (
              <div class={styles.Line}>
                <div class={`${styles.Strip} ${styles.added}`}>
                  <IconTsx icon='plus' />
                </div>
                <div class={styles.Content}>
                  {item}
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={hasAdded() && hasRemoved()}>
        <div class={styles.Separator} />
      </Show>

      <Show when={hasRemoved()}>
        <div class={`${styles.Block} ${styles.removed}`} classList={{
          [props.vertical ? styles.unroundedLeft : styles.unroundedTop]: hasAdded()
        }}>
          <div class={`${styles.Border} ${styles.removed}`} />
          <For each={removedAsArray()}>
            {item => (
              <div class={styles.Line}>
                <div class={`${styles.Strip} ${styles.removed}`}>
                  <IconTsx icon='minus' />
                </div>
                <div class={styles.Content}>
                  {item}
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
