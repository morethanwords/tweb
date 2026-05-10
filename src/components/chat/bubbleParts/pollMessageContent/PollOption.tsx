import ripple from '@components/ripple';
import StaticRadio from '@components/staticRadio';
import PhotoTsx from '@components/wrappers/photoTsx';
import {animateValue} from '@helpers/animateValue';
import {keepMe} from '@helpers/keepMe';
import clamp from '@helpers/number/clamp';
import formatNumber from '@helpers/number/formatNumber';
import createMiddleware from '@helpers/solid/createMiddleware';
import {requestRAF} from '@helpers/solid/requestRAF';
import classNames from '@helpers/string/classNames';
import {Photo} from '@layer';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import {Accessor, createEffect, createMemo, createSignal, onCleanup, onMount, Show} from 'solid-js';
import {Transition} from 'solid-transition-group';
import {InMessageCheckbox} from '../inMessageCheckbox';
import {AutoHeight} from './AutoHeight';
import {usePollMessageContentProps} from './context';
import {AvatarGroup} from './parts';
import PathDot from './PathDot';
import styles from './styles.module.scss';
import {LocalTextWithEntities, PollOptionResult} from './utils';


keepMe(ripple);


const progressTransitionTimeBase = 600; // ms

export const PollOption = (props: {
  withImage?: boolean;
  photo?: Photo.photo;
  clickable?: boolean;
  text: LocalTextWithEntities;
  checked: boolean;
  onToggle: () => void;
  isCheckbox: boolean;

  result?: PollOptionResult;
}) => {
  const contextProps = usePollMessageContentProps();

  const isShowingResult = createMemo(() => !!props.result);

  const [canAnimate, setCanAnimate] = createSignal(false);

  // On initial render with existing result, the percentage will be shown immediately
  // Otherwise, it will be hidden until the path animation ends
  const [canShowPercentage, setCanShowPercentage] = createSignal(isShowingResult());

  const percentage = createMemo(() => clamp(props.result?.percent ?? 0, 0, 100));

  const middleware = createMiddleware().get();

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
        <Transition name='fade-2'>
          <Show when={!isShowingResult()}>
            <Show
              when={props.isCheckbox}
              fallback={<StaticRadio class={styles.checkbox} checked={props.checked} />}
            >
              <InMessageCheckbox class={styles.checkbox} checked={props.checked} isOutgoing={contextProps.isOutgoing} />
            </Show>
          </Show>
          <Show when={isShowingResult() && canShowPercentage()}>
            <div class={styles.percent}>
              <AnimatedPercentage percentage={percentage()} canAnimate={canAnimate()} />
            </div>
          </Show>
        </Transition>
      </div>
      <div class={styles.labelRow}>
        <div class={styles.labelText}>
          <AutoHeight>
            {wrapRichText(props.text.text, {entities: props.text.entities, middleware})}
          </AutoHeight>
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
            <PollProgressLine progress={(props.result.percent || 0) / 100} canAnimate={canAnimate()} />
          </Show>
        </Transition>
        <Transition name='fade-2'>
          <Show when={canAnimate() && isShowingResult() && !canShowPercentage()}>
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
          <Show when={isShowingResult() && canShowPercentage() && props.result.chosen}>
            <InMessageCheckbox
              round={!props.isCheckbox}
              class={styles.chosenCheckbox}
              checked
              isOutgoing={contextProps.isOutgoing}
            />
          </Show>
        </Transition>
      </div>
      <Show when={props.withImage}>
        <div class={classNames(styles.pollOptionMedia, styles.stripped)}>
          <Show when={props.photo}>
            <PhotoTsx photo={props.photo} boxWidth={36} boxHeight={36} />
          </Show>
        </div>
      </Show>
    </div>
  );
};

const PollProgressLine = (props: {
  progress: number; // 0-1
  canAnimate: boolean;
}) => {
  const animatedProgress = useAnimatedValueFromZero(
    () => props.progress,
    () => props.canAnimate,
    (value, prevValue) => progressTransitionTimeBase * Math.abs(value - prevValue)
  );

  return (
    <div class={styles.labelProgress}>
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
