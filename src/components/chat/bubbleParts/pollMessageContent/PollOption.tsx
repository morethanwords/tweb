import ripple from '@components/ripple';
import {Spinner} from '@components/spinner';
import StaticRadio from '@components/staticRadio';
import PhotoTsx from '@components/wrappers/photoTsx';
import {animateValue} from '@helpers/animateValue';
import {keepMe} from '@helpers/keepMe';
import clamp from '@helpers/number/clamp';
import formatNumber from '@helpers/number/formatNumber';
import {createDelayed} from '@helpers/solid/createDelayed';
import createMiddleware from '@helpers/solid/createMiddleware';
import {requestRAF} from '@helpers/solid/requestRAF';
import classNames from '@helpers/string/classNames';
import {Photo} from '@layer';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {Accessor, createEffect, createMemo, createSignal, JSX, Match, onCleanup, onMount, Show, splitProps, Switch} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {Transition} from 'solid-transition-group';
import {InMessageCheckbox} from '../inMessageCheckbox';
import {usePollMessageContentProps} from './context';
import {AvatarGroup} from './parts';
import PathDot from './PathDot';
import styles from './styles.module.scss';
import {dataPollViewerIdx, DataPollViewerIdxDirectivePayload, LocalTextWithEntities, PollOptionResult, spinnerThickness} from './utils';


keepMe(ripple);
keepMe(dataPollViewerIdx);

const progressTransitionTimeBase = 600; // ms

export const PollOption = (props: {
  withImage?: boolean;
  photo?: Photo.photo;
  clickable?: boolean;
  text: LocalTextWithEntities;
  checked: boolean;
  onToggle: () => void;
  allowMultipleAnswers: boolean;
  hasCorrectAnswer: boolean;
  pollViewerPayload?: DataPollViewerIdxDirectivePayload;
  isPendingVote?: boolean;

  result?: PollOptionResult;
}) => {
  const {TranslatableMessageTsx} = useHotReloadGuard()
  const contextProps = usePollMessageContentProps();

  const isShowingResult = createMemo(() => !!props.result);

  const [canAnimate, setCanAnimate] = createSignal(false);

  // On initial render with existing result, the percentage will be shown immediately
  // Otherwise, it will be hidden until the path animation ends
  const [canShowPercentage, setCanShowPercentage] = createSignal(isShowingResult());

  const percentage = createMemo(() => clamp(props.result?.percent ?? 0, 0, 100));

  const canShowPercentageCheckbox = createMemo(() => (
    isShowingResult() && canShowPercentage() &&
    // Show a checkbox when the option is chosen in poll mode, or always when in quiz mode with check and cross marks
    (props.result.chosen || props.hasCorrectAnswer)
  ));

  // So it waits a little bit for the spinner to disappear
  const delayedIsPendingVote = createDelayed(() => props.isPendingVote ?? false, false, (value) => value ? -1 : 100);

  onMount(() => {
    requestRAF(() => {
      setCanAnimate(true);
    });
  });

  createEffect(() => {
    if(isShowingResult()) {
      // Reset after we don't show the result anymore
      onCleanup(() => {
        setCanShowPercentage(false);
      });
    }
  });

  return (
    <div class={styles.pollOption} classList={{[styles.hasMedia]: props.withImage}}>
      <Show when={!isShowingResult()}>
        <div class={styles.clickableArea} classList={{[styles.outgoing]: contextProps.isOutgoing}} use:ripple onClick={props.onToggle} />
      </Show>
      <div class={styles.checkContainer}>
        <Transition name='fade'>
          <Switch>
            <Match when={props.isPendingVote}>
              <div class={styles.spinnerContainer}>
                <Spinner thickness={spinnerThickness} />
              </div>
            </Match>
            <Match when={!isShowingResult()}>
              <Show
                when={props.allowMultipleAnswers}
                fallback={<StaticRadio class={styles.checkbox} checked={props.checked} />}
              >
                <InMessageCheckbox class={styles.checkbox} checked={props.checked} isOutgoing={contextProps.isOutgoing} />
              </Show>
            </Match>
            <Match when={canShowPercentage()}>
              <div class={styles.percent}>
                <AnimatedPercentage percentage={percentage()} canAnimate={canAnimate()} />
              </div>
            </Match>
          </Switch>
        </Transition>
      </div>
      <div class={styles.labelRow}>
        <div class={styles.labelText}>
          <TranslatableMessageTsx
            peerId={contextProps.peerId}
            textWithEntities={{_: 'textWithEntities', text: props.text.text, entities: unwrap(props.text.entities)}}
            richTextOptions={{middleware: createMiddleware().get(), loadPromises: contextProps.loadPromises}}
          />
        </div>
        <Show when={isShowingResult() && props.result.voters}>
          <div class={styles.labelStats}>
            <div class={styles.labelNumber}>
              {formatNumber(props.result.voters, 1)}
            </div>
            <Show when={props.result.peerIds?.length > 0}>
              <AvatarGroup peerIds={props.result.peerIds} />
            </Show>
          </div>
        </Show>

        <Transition name='fade-2'>
          <Show when={isShowingResult() && canShowPercentage()}>
            <PollProgressLine
              progress={(props.result.percent || 0) / 100}
              canAnimate={canAnimate()}
              hasCorrectAnswer={props.hasCorrectAnswer}
              correct={props.result.correct}
            />
          </Show>
        </Transition>
        <Transition name='fade-2'>
          <Show when={canAnimate() && isShowingResult() && !canShowPercentage() && !delayedIsPendingVote()}>
            <PathDot
              class={styles.pathDot}
              dotColor='var(--primary-color)'
              width={34}
              height={24}
              dotThickness={4}
              dotLength={3.6}
              radius={8}
              padding={0}
              duration={0.4}
              onAnimationEnd={() => void setCanShowPercentage(true)}
            />
          </Show>
        </Transition>
        <Transition name='fade-2'>
          <Show when={canShowPercentageCheckbox() && props.hasCorrectAnswer && props.result.chosen}>
            <div
              class={styles.chosenCheckboxDot}
              classList={{
                [styles.correct]: !contextProps.isOutgoing && props.result.correct,
                [styles.wrong]: !contextProps.isOutgoing && !props.result.correct
              }}
            />
          </Show>
        </Transition>
        <Transition name='fade-2'>
          <Show when={canShowPercentageCheckbox()}>
            <InMessageCheckbox
              round={!props.allowMultipleAnswers}
              class={styles.chosenCheckbox}
              classList={{
                // Let it be white when the poll is sent by us
                [styles.correct]: !contextProps.isOutgoing && props.hasCorrectAnswer && props.result.correct,
                [styles.wrong]: !contextProps.isOutgoing && props.hasCorrectAnswer && !props.result.correct
              }}
              checked
              cross={props.hasCorrectAnswer ? !props.result.correct : undefined}
              isOutgoing={contextProps.isOutgoing}
            />
          </Show>
        </Transition>
      </div>
      <Show when={props.withImage}>
        <div
          class={classNames(styles.pollOptionMedia, styles.stripped)}
          classList={{[styles.clickable]: !!props.photo}}
          use:dataPollViewerIdx={props.pollViewerPayload}
        >
          <Show when={props.photo}>
            <PhotoTsx
              photo={props.photo}
              boxWidth={36}
              boxHeight={36}
              loadPromises={contextProps.loadPromises}
              autoDownloadSize={contextProps.autoDownload?.photo}
            />
          </Show>
        </div>
      </Show>
    </div>
  );
};

const PollProgressLine = (inProps: JSX.HTMLAttributes<HTMLDivElement> & {
  progress: number; // 0-1
  canAnimate: boolean;
  hasCorrectAnswer?: boolean;
  correct?: boolean;
}) => {
  const contextProps = usePollMessageContentProps();

  const [props, restProps] = splitProps(inProps, ['class', 'classList', 'progress', 'canAnimate', 'hasCorrectAnswer', 'correct']);

  const animatedProgress = useAnimatedValueFromZero(
    () => props.progress,
    () => props.canAnimate,
    (value, prevValue) => progressTransitionTimeBase * Math.abs(value - prevValue)
  );

  return (
    <div
      class={classNames(styles.labelProgress, props.class)}
      classList={{
        [styles.correct]: !contextProps.isOutgoing && props.hasCorrectAnswer && props.correct,
        [styles.wrong]: !contextProps.isOutgoing && props.hasCorrectAnswer && !props.correct,
        [styles.isOutgoing]: contextProps.isOutgoing && props.hasCorrectAnswer,
        ...props.classList
      }}
      {...restProps}>
      <div
        class={styles.labelProgressFill}
        style={{
          '--progress': animatedProgress()
        }}
      />
    </div>
  );
};

// Needs to be separate so it doesn't animate when results are not shown. Also it makes sure it resets when the vote is retracted.
const AnimatedPercentage = (props: {
  percentage: number; // 0-100
  canAnimate: boolean;
}) => {
  const animatedPercentage = useAnimatedValueFromZero(
    () => props.percentage,
    () => props.canAnimate,
    (value, prevValue) => progressTransitionTimeBase * 1.5 * Math.abs(value - prevValue) / 100
  );

  return <>{animatedPercentage() | 0}%</>;
};

/**
 * Animates initially from zero, then from the previous value to the new value when it changes.
 */
const useAnimatedValueFromZero = (value: Accessor<number>, canAnimate: Accessor<boolean>, getDurationFromValue: (value: number, prevValue: number) => number) => {
  let prevValue = 0;
  const [current, setCurrent] = createSignal(canAnimate() ? 0 : value());

  createEffect(() => {
    if(!canAnimate()) {
      prevValue = value();
      return;
    }

    if(value() === prevValue) return;

    const duration = getDurationFromValue(value(), prevValue);
    const cancel = animateValue(prevValue, value(), duration, setCurrent, {
      easing: p => p
    });

    prevValue = value();

    onCleanup(cancel);
  });

  return current;
}

export default PollOption;
