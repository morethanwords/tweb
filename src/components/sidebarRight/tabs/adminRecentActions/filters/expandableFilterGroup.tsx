import {Accessor, createMemo, createSignal, For, JSX, Show} from 'solid-js';
import CheckboxFieldTsx from '../../../../checkboxFieldTsx';
import {IconTsx} from '../../../../iconTsx';
import {HeightTransition} from '../heightTransition';
import styles from './expandableFilterGroup.module.scss';


type Item = {
  checked: Accessor<boolean>;
  label: JSX.Element;
  onClick: () => void;
};

type ExpandableFilterGroupProps = {
  mainLabel: JSX.Element;
  onMainCheckboxClick: () => void;
  checkedCount: number;
  items: Item[];
};

export const ExpandableFilterGroup = (props: ExpandableFilterGroupProps) => {
  const [isExpanded, setIsExpanded] = createSignal(false);

  const isMainChecked = createMemo(() => props.items.every(item => item.checked()));

  const onMainCheckboxClick = (e: MouseEvent) => {
    e.stopPropagation();
    props.onMainCheckboxClick();
  };

  return (
    <>
      <div class={`${styles.Row} hover-effect`} onClick={() => setIsExpanded(!isExpanded())}>
        <div class={styles.RowCheckboxWrapper} onClick={onMainCheckboxClick}>
          <CheckboxFieldTsx class={styles.RowCheckbox} checked={isMainChecked()} />
        </div>
        <div class={styles.RowSeparator} />
        <div class={styles.RowLabel}>
          {props.mainLabel}
          <div class={styles.Count}>
            {props.checkedCount}/{props.items.length}
            <IconTsx class={styles.CountArrow} classList={{[styles.toggled]: isExpanded()}} icon='arrowhead' />
          </div>
        </div>
      </div>

      <HeightTransition>
        <Show when={isExpanded()}>
          <div class={styles.ExpandedItems}>
            <For each={props.items}>
              {item => (
                <div class={`${styles.Row} hover-effect`} onClick={item.onClick}>
                  <div class={styles.RowOffset} />
                  <div class={styles.RowCheckboxWrapper}>
                    <CheckboxFieldTsx class={styles.RowCheckbox} checked={item.checked()} />
                  </div>
                  <div class={styles.RowLabel}>
                    {item.label}
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </HeightTransition>
    </>
  )
};
