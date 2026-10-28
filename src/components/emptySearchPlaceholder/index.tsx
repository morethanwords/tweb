import {createSignal, Show} from 'solid-js';
import {i18n} from '@lib/langPack';
import lottieLoader from '@lib/lottie/lottieLoader';
import defineSolidElement, {PassedProps} from '@lib/solidjs/defineSolidElement';
import LottieAnimation from '@components/lottieAnimation';
import ripple from '@components/ripple';
import styles from '@components/emptySearchPlaceholder/styles.module.scss';
ripple;

if(import.meta.hot) import.meta.hot.accept();


type Props = {
  onAllChats?: () => void;
};

const EmptySearchPlaceholder = defineSolidElement({
  name: 'empty-search-placeholder',
  component: (props: PassedProps<Props>) => {
    props.element.classList.add(styles.Container);

    // * the duck comes in with its first frame, not after the words under it
    const [isDrawn, setIsDrawn] = createSignal(false);

    return (
      <>
        <LottieAnimation
          class={isDrawn() ? `${styles.LottieAnimation} ${styles.isDrawn}` : styles.LottieAnimation}
          size={156}
          lottieLoader={lottieLoader}
          restartOnClick
          name="UtyanSearch"
          onPromise={(promise) => promise.then((player) => player.onFirstFrame(() => setIsDrawn(true)))}
        />

        <div class={styles.NoResults} role="status">
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
