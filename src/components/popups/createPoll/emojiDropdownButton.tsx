import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import InputField from '@components/inputField';
import {attachClassName} from '@helpers/solid/classname';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createMemo, onCleanup} from 'solid-js';


export type EmojiDropdownButtonProps = {
  class?: string;
  onToggle?: (hasDropdown: boolean) => void;
  inputField: InputField
};

export const EmojiDropdownButton = (props: EmojiDropdownButtonProps) => {
  const {createEmojiDropdownButton} = useHotReloadGuard();

  const button = createMemo(() => {
    let emoticonsDropdown: EmoticonsDropdown;

    const {button} = createEmojiDropdownButton({
      inputField: props.inputField,
      onEmoticonsDropdown: (value) => {
        emoticonsDropdown = value;

        props.onToggle?.(!!emoticonsDropdown);
      }
    });

    attachClassName(button, () => props.class);

    button.tabIndex = -1;

    onCleanup(() => {
      props.onToggle?.(false);
      emoticonsDropdown?.hideAndDestroy();
    });

    return button;
  });


  return (
    <>{button()}</>
  );
};
