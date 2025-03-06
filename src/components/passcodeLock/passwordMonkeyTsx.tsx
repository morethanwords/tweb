import {Component, createRenderEffect, createSignal, mergeProps, onCleanup, Ref} from 'solid-js';

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

  createRenderEffect(() => {
    const monkey = new PasswordMonkey(props.passwordInputField, props.size);
    monkey.load();
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
    </div>
  );
};

export default PasswordMonkeyTsx;
