import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import InputField from '@components/inputField';
import {useSimpleFormFieldContext} from '@components/simpleFormField';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createMemo, onCleanup} from 'solid-js';
import styles from './styles.module.scss';


export const EmojiDropdownButton = (props: { inputField: InputField }) => {
  const {createEmojiDropdownButton} = useHotReloadGuard();
  const {useSetForceFocused} = useSimpleFormFieldContext();

  const button = createMemo(() => {
    const setForceFocused = useSetForceFocused();

    let emoticonsDropdown: EmoticonsDropdown;

    const {button} = createEmojiDropdownButton({
      inputField: props.inputField,
      onEmoticonsDropdown: (value) => {
        emoticonsDropdown = value;

        setForceFocused(!!emoticonsDropdown);
        button.classList.toggle(styles.forceFocused, !!emoticonsDropdown);
      }
    });

    onCleanup(() => {
      emoticonsDropdown?.hideAndDestroy();
    });

    button.classList.add(styles.emojiDropdownButton);
    button.tabIndex = -1;

    return button;
  });

  return (
    <>{button()}</>
  );
};
