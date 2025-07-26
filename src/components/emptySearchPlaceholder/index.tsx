import {Show} from 'solid-js';
import {i18n} from '../../lib/langPack';
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
          <div class={styles.NoResultsTitle}>{i18n('NoResultsTitle')}</div>
          <div class={styles.NoResultsSubtitle}>{i18n('NoResultsSubtitle')}</div>
        </div>


        <Show when={props.onAllChats}>
          <button
            use:ripple
            class={`btn primary ${styles.ActionButton}`}
            onClick={props.onAllChats}
          >
            {i18n('SearchInAllChats')}
          </button>
        </Show>
      </>
    );
  }
});

export default EmptySearchPlaceholder;
