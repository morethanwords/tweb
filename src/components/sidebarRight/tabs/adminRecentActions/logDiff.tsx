import {For, JSX, Show} from 'solid-js';
import {IconTsx} from '../../../iconTsx';
import styles from './logDiff.module.scss';


type LogDiffProps = {
  added?: JSX.Element;
  removed?: JSX.Element;
};

export const LogDiff = (props: LogDiffProps) => {
  const addedAsArray = () => props.added ? props.added instanceof Array ? props.added : [props.added] : [];
  const removedAsArray = () => props.removed ? props.removed instanceof Array ? props.removed : [props.removed] : [];

  const hasAdded = () => addedAsArray().length > 0;
  const hasRemoved = () => removedAsArray().length > 0;

  return (
    <>
      <Show when={hasAdded()}>
        <div class={`${styles.Block} ${styles.added}`} classList={{
          [styles.unroundedBottom]: hasRemoved()
        }}>
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
          [styles.unroundedTop]: hasAdded()
        }}>
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
    </>
  );
};
