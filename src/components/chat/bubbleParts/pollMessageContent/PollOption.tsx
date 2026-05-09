import ripple from '@components/ripple';
import {StaticCheckbox} from '@components/staticCheckbox';
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
import {createEffect, createMemo, createSignal, onCleanup, onMount, Show} from 'solid-js';
import {Transition} from 'solid-transition-group';
import {AutoHeight} from './AutoHeight';
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
  const isShowingResult = createMemo(() => !!props.result);

  const [canAnimate, setCanAnimate] = createSignal(true);

  // On initial render with existing result, the percentage will be shown immediately
  // Otherwise, it will be hidden until the path animation ends
  const [canShowPercentage, setCanShowPercentage] = createSignal(false);

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
    <div class={styles.pollOption} classList={{[styles.hasImage]: props.withImage}}>
      <Show when={!isShowingResult()}>
        <div class={styles.clickableArea} use:ripple onClick={props.onToggle} />
      </Show>
      <div class={styles.checkContainer}>
        <Transition name='fade-2'>
          <Show when={!isShowingResult()}>
            <Show
              when={props.isCheckbox}
              fallback={<StaticRadio class={styles.checkbox} checked={props.checked} />}
            >
              <StaticCheckbox class={styles.checkbox} checked={props.checked} />
            </Show>
          </Show>
          <Show when={isShowingResult() && canShowPercentage()}>
            <div class={styles.percent}>
              <AnimatedPercentage value={props.result.percent || 0} canAnimate={canAnimate()} />%
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
        <Show when={isShowingResult()}>
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
          <Show when={isShowingResult() && canShowPercentage()}>
            <StaticCheckbox round={!props.isCheckbox} class={styles.chosenCheckbox} checked={props.result.chosen} />
          </Show>
        </Transition>
      </div>
      <Show when={props.withImage}>
        <div class={classNames(styles.optionImage)}>
          <Show when={props.photo}>
            <PhotoTsx photo={props.photo} boxWidth={36} boxHeight={36} />
          </Show>
        </div>
      </Show>
    </div>
  );
};

const PollProgressLine = (props: {
  progress: number;
  canAnimate?: boolean;
}) => {
  const [fillWidth, setFillWidth] = createSignal(props.canAnimate ? 0 : props.progress);

  onMount(() => {
    if(!props.canAnimate) return;

    requestRAF(() => requestRAF(() => {
      setFillWidth(props.progress);
    }));
  });

  return (
    <div class={styles.labelProgress}>
      <div
        class={styles.labelProgressFill}
        style={{
          '--fill-width': fillWidth(),
          '--transition-time': `${progressTransitionTimeBase * props.progress}ms`
        }}
      />
    </div>
  );
};

const AnimatedPercentage = (props: {
  value: number;
  canAnimate?: boolean;
}) => {
  const value = createMemo(() => clamp(props.value, 0, 100));
  const [current, setCurrent] = createSignal(props.canAnimate ? 0 : value());

  onMount(() => {
    if(!props.canAnimate || props.value === 0) return;

    const duration = progressTransitionTimeBase * 1.5 * value() / 100;
    const cancel = animateValue(0, value(), duration, (value) => setCurrent(value | 0));
    onCleanup(cancel);
  });

  return <>{current()}</>;
};

export default PollOption;
