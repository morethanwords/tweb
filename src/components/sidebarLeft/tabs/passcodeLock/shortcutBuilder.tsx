import {Component, createSelector, JSX} from 'solid-js';

import {IS_APPLE} from '../../../../environment/userAgent';

import {IconTsx} from '../../../iconTsx';
import ripple from '../../../ripple'; ripple; // keep

import styles from './shortcutBuilder.module.scss';


export type ShortcutKey = 'Ctrl' | 'Alt' | 'Shift' | 'Meta';

const shortcutKeys: ShortcutKey[] = ['Ctrl', 'Alt', 'Shift', 'Meta'];

const ShortcutBuilder: Component<{
  class?: string;
  value: ShortcutKey[];
  onChange: (value: ShortcutKey[]) => void;
  key: string;
}> = (props) => {
  const isSelected = createSelector(() => props.value, (value: ShortcutKey, shortcuts) => shortcuts.includes(value));

  const getKeyContent = (key: ShortcutKey): JSX.Element => {
    if(key === 'Meta') {
      return <IconTsx icon={IS_APPLE ? 'mac_command_key' : 'win_key'} />;
    }
    return <span>{key}</span>;
  };

  const onKeyClick = (key: ShortcutKey) => {
    if(props.value.includes(key)) {
      const newValue = props.value.filter((k) => k !== key);

      if(!newValue.length) {
        const indicies = [0, 1, 2, 3].filter((i) => i !== shortcutKeys.indexOf(key));
        newValue.push(shortcutKeys[indicies[Math.floor(Math.random() * indicies.length)]]);
      }

      props.onChange(newValue);
    } else {
      props.onChange([...props.value, key]);
    }
  };

  return (
    <div class={styles.Container} classList={{[props.class]: !!props.class}}>
      <div class={styles.KeysContainer}>
        {shortcutKeys.map((key, idx, array) => (
          <button
            use:ripple
            class={styles.KeyButton}
            classList={{
              [styles.selected]: isSelected(key),
              [styles.KeyButtonFirst]: idx === 0,
              [styles.KeyButtonLast]: idx === array.length - 1
            }}
            onClick={[onKeyClick, key]}
          >
            {getKeyContent(key)}
          </button>
        ))}
      </div>
      <IconTsx class={styles.PlusIcon} icon="plus" />
      <div class={styles.TargetKey}>
        {props.key}
      </div>
    </div>
  );
};

export default ShortcutBuilder;
