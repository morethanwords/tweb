import {JSX, Show} from 'solid-js';

import {AutoHeight} from '@components/autoHeight';

import styles from '@/pages/authFlow.module.scss';

/**
 * The error line under a code field ("Invalid code", "Code expired").
 *
 * It used to hold a line of height at all times so that an arriving error would
 * not push the card around. It costs that line on every card that has never seen
 * an error, though — so instead the line takes no room until there is something
 * to say, and `AutoHeight` animates the card growing by it rather than letting it
 * jump.
 */
export default function AuthCardError(props: {content: JSX.Element}) {
  return (
    <AutoHeight overflowHidden>
      <Show when={props.content}>
        {/* the element is inserted the moment there is an error, which is what makes
            assistive tech read it out */}
        <div role="alert" class={styles.errorLabel}>{props.content}</div>
      </Show>
    </AutoHeight>
  );
}
