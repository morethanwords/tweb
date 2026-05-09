import classNames from '@helpers/string/classNames';
import {JSX, splitProps} from 'solid-js';
import styles from './staticCheckbox.module.scss';


export type StaticCheckboxProps = {
  checked?: boolean;
  round?: boolean;
  borderColor?: string;
  checkColor?: string;
} & JSX.HTMLAttributes<HTMLDivElement>;

export const StaticCheckbox = (inProps: StaticCheckboxProps) => {
  const [props, restProps] = splitProps(inProps, ['checked', 'round', 'checkColor', 'borderColor', 'class', 'classList']);

  return (
    <div
      class={classNames(styles.Checkbox, props.class)}
      classList={{
        [styles.checked]: props.checked,
        [styles.round]: props.round,
        ...props.classList
      }}
      {...restProps}
    >
      <div class={styles.Border} style={{'--checkbox-border-color': props.borderColor}}></div>
      <div class={styles.Background}></div>
      <svg
        class={styles.Check}
        viewBox="0 0 24 24"
        style={{'--check-color': props.checkColor}}
      ><use href="#check" x="-1"></use></svg>
    </div>
  );
};
