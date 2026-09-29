import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {IconTsx} from '@components/iconTsx';
import ripple from '@components/ripple';
import styles from '@components/sidebarRight/tabs/adminRecentActions/filters/expandableFilterGroup.module.scss';
import {keepMe} from '@helpers/keepMe';
import {HeightTransition} from '@helpers/solid/heightTransition';
import {Accessor, createMemo, createSignal, createUniqueId, For, JSX, Show} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import Modes from '@config/modes';
import A11yButton from '@components/a11yButton';
import classNames from '@helpers/string/classNames';

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

  // The checkboxes are real controls only with the keyboard layer. Without it the rows take the
  // clicks and the checkboxes just show the state, as they did before the layer.
  const checkboxClass = Modes.a11y ? styles.RowCheckbox : classNames(styles.RowCheckbox, styles.RowCheckboxPassive);

  return (
    <>
      <div class={`${styles.Row} hover-effect rp`} use:ripple onClick={() => setIsExpanded(!isExpanded())}>
        <div
          class={styles.RowCheckboxWrapper}
          onClick={(e) => {
            e.stopPropagation();
            if(!Modes.a11y) props.onMainCheckboxClick();
          }}
        >
          <CheckboxFieldTsx
            class={checkboxClass}
            checked={isMainChecked()}
            onChange={Modes.a11y ? props.onMainCheckboxClick : undefined}
            ref={(field) => field.input.setAttribute('aria-labelledby', mainLabelId)}
          />
          {!Modes.a11y && <div class={styles.RowCheckboxClickArea} />}
        </div>
        <div class={styles.RowSeparator} />
        <A11yButton
          class={styles.RowLabel}
          aria-expanded={isExpanded()}
        >
          <span id={mainLabelId}>{props.mainLabel}</span>
          <span class={styles.Count}>
            {props.checkedCount}/{props.items.length}
            <IconTsx class={styles.CountArrow} classList={{[styles.toggled]: isExpanded()}} icon='arrowhead' />
          </span>
        </A11yButton>
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
                  onClick={Modes.a11y ? undefined : item.onClick}
                >
                  <div class={styles.RowOffset} />
                  <div class={styles.RowCheckboxWrapper}>
                    <CheckboxFieldTsx
                      class={checkboxClass}
                      checked={item.checked()}
                      onChange={Modes.a11y ? item.onClick : undefined}
                      ref={(field) => field.input.id = inputId}
                    />
                  </div>
                  <Dynamic
                    component={Modes.a11y ? 'label' : 'div'}
                    for={Modes.a11y ? inputId : undefined}
                    class={styles.RowLabel}
                  >
                    {item.label}
                  </Dynamic>
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
