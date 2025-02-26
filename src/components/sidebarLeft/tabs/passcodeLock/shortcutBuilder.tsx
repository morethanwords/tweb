import {Component, createSelector} from 'solid-js';

import {IconTsx} from '../../../iconTsx';
import ripple from '../../../ripple'; // keep

import styles from './shortcutBuilder.module.scss';


export type ShortcutKey = 'Ctrl' | 'Alt' | 'Shift' | 'Meta';

const shortcutKeys: ShortcutKey[] = ['Ctrl', 'Alt', 'Shift', 'Meta'];

const ShortcutBuilder: Component<{
  value: ShortcutKey[];
  onChange: (value: ShortcutKey[]) => void;
  key: string;
}> = (props) => {
  const isSelected = createSelector(() => props.value, (value: ShortcutKey, shortcuts) => shortcuts.includes(value));

  return (
    <div class={styles.Container}>
      <div class={styles.KeysContainer}>
        {shortcutKeys.map((key) => (
          <button
            use:ripple
            class={styles.KeyButton}
            classList={{[styles.selected]: isSelected(key)}}
            onClick={() => {
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
            }}
          >
            <span>
              {key}
            </span>
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
