import {Component, createRenderEffect, createSignal, mergeProps, onCleanup, Ref, Show} from 'solid-js';

import PasswordInputField from '../passwordInputField';
import PasswordMonkey from '../monkeys/password';

import styles from './passwordMonkeyTsx.module.scss';


const PasswordMonkeyTsx: Component<{
  ref?: Ref<HTMLDivElement>;
  passwordInputField: PasswordInputField;
  hidden?: boolean;
  size?: number;
}> = (inProps) => {
  const props = mergeProps({size: 100}, inProps);

  const [monkey, setMonkey] = createSignal<PasswordMonkey>();
  const [monkeyLoaded, setMonkeyLoaded] = createSignal(false);

  createRenderEffect(() => {
    const monkey = new PasswordMonkey(props.passwordInputField, props.size);
    monkey.load().then(() => setMonkeyLoaded(true));
    setMonkey(monkey);

    onCleanup(() => {
      monkey.remove();
    });
  });

  return (
    <div
      ref={props.ref}
      class={styles.PasswordMonkey}
      classList={{
        [styles.hidden]: props.hidden
      }}
      style={{'--size': props.size + 'px'}}
    >
      {monkey().container}

      {/* Prevent the monkey blinking when reloading the page */}
      <Show when={!monkeyLoaded()}>
        <img class={styles.MonkeyImage} src="assets/img/password-monkey-closed.png" />
      </Show>
    </div>
  );
};

export default PasswordMonkeyTsx;
