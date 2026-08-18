import {JSX} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {PreloaderTsx} from '@components/putPreloader';
import styles from '@components/searchStatus.module.scss';

/**
 * Spinner shown inside a section while an inline search is in flight.
 */
export function SearchLoading(props: {
  class?: string,
  'aria-label'?: string
}) {
  return (
    <div
      class={classNames(styles.loading, props.class)}
      role="status"
      aria-live="polite"
      aria-label={props['aria-label']}
    >
      <PreloaderTsx class={styles.preloader} />
    </div>
  );
}

/**
 * Centered secondary text shown instead of the results of an inline search.
 */
export function SearchEmpty(props: {
  children: JSX.Element,
  class?: string
}) {
  return (
    <div class={classNames(styles.empty, props.class)} role="status" aria-live="polite">
      {props.children}
    </div>
  );
}
