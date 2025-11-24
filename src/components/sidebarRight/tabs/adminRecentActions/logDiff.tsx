import {JSX, Show} from 'solid-js';
import styles from './logDiff.module.scss';
import {IconTsx} from '../../../iconTsx';

type LogDiffProps = {
  added?: JSX.Element;
  removed?: JSX.Element;
};

export const LogDiff = (props: LogDiffProps) => {
  console.log('log diff called')
  return (
    <>
      <Show when={props.added}>
        <div class={`${styles.Block} ${styles.added}`} classList={{
          [styles.unroundedBottom]: !!props.removed
        }}>
          <div class={`${styles.Strip} ${styles.added}`}>
            <IconTsx icon='plus' />
          </div>
          <div class={styles.Content}>
            {props.added}
          </div>
        </div>
      </Show>

      <Show when={props.added && props.removed}>
        <div class={styles.Separator} />
      </Show>

      <Show when={props.removed}>
        <div class={`${styles.Block} ${styles.removed}`} classList={{
          [styles.unroundedTop]: !!props.added
        }}>
          <div class={`${styles.Strip} ${styles.removed}`}>
            <IconTsx icon='minus' />
          </div>
          <div class={styles.Content}>
            {props.removed}
          </div>
        </div>
      </Show>
    </>
  );
};
