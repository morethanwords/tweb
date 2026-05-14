import defineSolidElement from '@lib/solidjs/defineSolidElement';
import {createMemo, mergeProps} from 'solid-js';
import styles from './spinner.module.scss';


type SpinnerProps = {
  /** (0-1] */
  thickness?: number;
};

const size = 24;
const radius = size / 2;

/**
 * Note: the spinner is positioned absolutely, needs a container
 */
export const Spinner = (inProps: SpinnerProps) => {
  const props = mergeProps({thickness: 1 / radius}, inProps);
  const strokeWidth = createMemo(() => props.thickness * radius);

  return (
    <svg class={styles.spinner} viewBox="0 0 24 24" width="100" height="100">
      <circle
        cx={radius}
        cy={radius}
        r={radius - strokeWidth() - 0.5}
        fill="none"
        stroke="white"
        stroke-width={strokeWidth()}
        stroke-linecap="round"
        stroke-dashoffset="0"
      />
    </svg>
  );
};

export const SpinnerElement = defineSolidElement({
  name: 'spinner-element',
  component: (props) => {
    props.element.classList.add(styles.container);
    return <Spinner />;
  }
});
