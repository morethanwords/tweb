import classNames from '@helpers/string/classNames';
import {JSX, splitProps} from 'solid-js';
import styles from './staticCheckbox.module.scss';


export type StaticCheckboxProps = JSX.HTMLAttributes<HTMLDivElement> & {
  checked?: boolean;
  round?: boolean;
  /**
   * TODO: animation from unchecked to checked is not yet supported, used as static for now
   */
  cross?: boolean;
};

export const StaticCheckbox = (inProps: StaticCheckboxProps) => {
  const [props, restProps] = splitProps(
    inProps,
    [
      'class',
      'classList',
      'checked',
      'round',
      'cross'
    ]
  );

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
      <div class={styles.Border}></div>
      <div class={styles.Background}></div>
      <svg
        class={styles.Check}
        viewBox="0 0 24 24"
      >
        <use
          href={props.cross ? '#checkbox-cross' : '#check'}
          x={props.cross ? undefined : '-1'}
        />
      </svg>
    </div>
  );
};
