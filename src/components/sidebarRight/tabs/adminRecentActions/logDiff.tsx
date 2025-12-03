import {For, JSX, Show} from 'solid-js';
import {IconTsx} from '../../../iconTsx';
import styles from './logDiff.module.scss';


type LogDiffProps = {
  added?: JSX.Element;
  removed?: JSX.Element;

  vertical?: boolean;
};

export const LogDiff = (props: LogDiffProps) => {
  const addedAsArray = () => props.added ? props.added instanceof Array ? props.added : [props.added] : [];
  const removedAsArray = () => props.removed ? props.removed instanceof Array ? props.removed : [props.removed] : [];

  const hasAdded = () => addedAsArray().length > 0;
  const hasRemoved = () => removedAsArray().length > 0;

  return (
    <div class={`interactable ${styles.Container}`} classList={{[styles.vertical]: props.vertical}}>
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
