import {Show} from 'solid-js';
import lottieLoader from '../../lib/rlottie/lottieLoader';
import defineSolidElement, {PassedProps} from '../../lib/solidjs/defineSolidElement';
import LottieAnimation from '../lottieAnimation';
import ripple from '../ripple';
import styles from './styles.module.scss';
ripple;

if(import.meta.hot) import.meta.hot.accept();


type Props = {
  onAllChats?: () => void;
};

const EmptySearchPlaceholder = defineSolidElement({
  name: 'empty-search-placeholder',
  component: (props: PassedProps<Props>) => {
    props.element.classList.add(styles.Container);

    return (
      <>
        <LottieAnimation
          class={styles.LottieAnimation}
          size={156}
          lottieLoader={lottieLoader}
          restartOnClick
          name="UtyanSearch"
        />

        <div class={styles.NoResults}>
          <div class={styles.NoResultsTitle}>No results</div>
          <div class={styles.NoResultsSubtitle}>Try a different search term</div>
        </div>

        <Show when={props.onAllChats}>
          <button
            use:ripple
            class={`btn primary ${styles.ActionButton}`}
            onClick={props.onAllChats}
          >
            Search in All Chats
          </button>
        </Show>
      </>
    );
  }
});

export default EmptySearchPlaceholder;
