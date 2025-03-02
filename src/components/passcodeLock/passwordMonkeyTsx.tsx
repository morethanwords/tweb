import {Component, createRenderEffect, createSignal, mergeProps, onCleanup} from 'solid-js';

import PasswordInputField from '../passwordInputField';
import PasswordMonkey from '../monkeys/password';

import styles from './passwordMonkeyTsx.module.scss';


const PasswordMonkeyTsx: Component<{
  passwordInputField: PasswordInputField;
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
    <div class={styles.PasswordMonkey} style={{'--size': props.size + 'px'}}>
      {monkey().container}
    </div>
  );
};

export default PasswordMonkeyTsx;
