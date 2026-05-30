import {useSimpleFormFieldContext} from '@components/simpleFormField';
import classNames from '@helpers/string/classNames';
import {splitProps} from 'solid-js';
import {EmojiDropdownButton, EmojiDropdownButtonProps} from './emojiDropdownButton';
import styles from './styles.module.scss';


export const EmojiButtonWithOpacity = (inProps: Omit<EmojiDropdownButtonProps, 'onToggle'>) => {
  const [props, restProps] = splitProps(inProps, ['class'])
  const {forceFocused, useSetForceFocused} = useSimpleFormFieldContext();

  const setForceFocused = useSetForceFocused();

  return (
    <EmojiDropdownButton
      class={classNames(props.class, styles.emojiDropdownButton, forceFocused() && styles.forceFocused)}
      {...restProps}
      onToggle={setForceFocused}
    />
  );
};
