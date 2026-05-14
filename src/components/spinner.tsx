import defineSolidElement from '@lib/solidjs/defineSolidElement';
import styles from './spinner.module.scss';


/**
 * Note: the spinner is positioned absolutely, needs a container
 */
export const Spinner = () => {
  return (
    <svg class={styles.spinner} viewBox="0 0 24 24" width="100" height="100">
      <circle
        cx="12"
        cy="12"
        r="10.5"
        fill="none"
        stroke="white"
        stroke-width="1"
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
