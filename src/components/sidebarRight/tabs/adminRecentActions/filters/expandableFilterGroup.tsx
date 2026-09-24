import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {IconTsx} from '@components/iconTsx';
import ripple from '@components/ripple';
import styles from '@components/sidebarRight/tabs/adminRecentActions/filters/expandableFilterGroup.module.scss';
import {keepMe} from '@helpers/keepMe';
import {HeightTransition} from '@helpers/solid/heightTransition';
import {Accessor, createMemo, createSignal, createUniqueId, For, JSX, Show} from 'solid-js';

keepMe(ripple);


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
  const mainLabelId = createUniqueId();

  const isMainChecked = createMemo(() => props.items.every(item => item.checked()));

  return (
    <>
      <div class={`${styles.Row} hover-effect rp`} use:ripple onClick={() => setIsExpanded(!isExpanded())}>
        <div
          class={styles.RowCheckboxWrapper}
          onClick={(e) => e.stopPropagation()}
        >
          <CheckboxFieldTsx
            class={styles.RowCheckbox}
            checked={isMainChecked()}
            onChange={props.onMainCheckboxClick}
            ref={(field) => field.input.setAttribute('aria-labelledby', mainLabelId)}
          />
        </div>
        <div class={styles.RowSeparator} />
        <button type="button" class={styles.RowLabel} aria-expanded={isExpanded()}>
          <span id={mainLabelId}>{props.mainLabel}</span>
          <span class={styles.Count}>
            {props.checkedCount}/{props.items.length}
            <IconTsx class={styles.CountArrow} classList={{[styles.toggled]: isExpanded()}} icon='arrowhead' />
          </span>
        </button>
      </div>

      <HeightTransition>
        <Show when={isExpanded()}>
          <div class={styles.ExpandedItems}>
            <For each={props.items}>
              {item => {
                const inputId = createUniqueId();
                return (
                <div
                  class={`${styles.Row} hover-effect rp`}
                  use:ripple
                >
                  <div class={styles.RowOffset} />
                  <div class={styles.RowCheckboxWrapper}>
                    <CheckboxFieldTsx
                      class={styles.RowCheckbox}
                      checked={item.checked()}
                      onChange={item.onClick}
                      ref={(field) => field.input.id = inputId}
                    />
                  </div>
                  <label for={inputId} class={styles.RowLabel}>
                    {item.label}
                  </label>
                </div>
                );
              }}
            </For>
          </div>
        </Show>
      </HeightTransition>
    </>
  )
};
