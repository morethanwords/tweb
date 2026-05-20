import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import InputField from '@components/inputField';
import cloneDOMRect from '@helpers/dom/cloneDOMRect';
import {attachClassName} from '@helpers/solid/classname';
import {subscribeOn} from '@helpers/solid/subscribeOn';
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
      customParentElement: document.body,
      onEmoticonsDropdown: (value) => {
        emoticonsDropdown = value;
      },
      getOpenPosition: () => {
        const rect = button.getBoundingClientRect();
        const cloned = cloneDOMRect(rect);
        cloned.top = rect.bottom + 8;
        return cloned;
      }
    });

    attachClassName(button, () => props.class);

    button.tabIndex = -1;

    subscribeOn(emoticonsDropdown)('open', () => {
      props.onToggle?.(true);
    });

    subscribeOn(emoticonsDropdown)('close', () => {
      props.onToggle?.(false);
    });

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
