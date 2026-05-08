import ripple from '@components/ripple';
import {StaticCheckbox} from '@components/staticCheckbox';
import StaticRadio from '@components/staticRadio';
import PhotoTsx from '@components/wrappers/photoTsx';
import {keepMe} from '@helpers/keepMe';
import formatNumber from '@helpers/number/formatNumber';
import createMiddleware from '@helpers/solid/createMiddleware';
import {requestRAF} from '@helpers/solid/requestRAF';
import classNames from '@helpers/string/classNames';
import {Photo} from '@layer';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import {createEffect, createSignal, onCleanup, Show} from 'solid-js';
import {Transition} from 'solid-transition-group';
import {AutoHeight} from './AutoHeight';
import {AvatarGroup} from './parts';
import styles from './styles.module.scss';
import {LocalTextWithEntities, PollOptionResult} from './utils';

keepMe(ripple);

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
  const [fillWidth, setFillWidth] = createSignal(0);

  const isShowingResult = () => !!props.result;

  const middleware = createMiddleware().get();

  createEffect(() => {
    if(!isShowingResult()) return;
    requestRAF(() => {
      setFillWidth((props.result.percent || 0.01) / 100);
    });
    onCleanup(() => {
      setFillWidth(0);
    });
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
          <Show when={isShowingResult()}>
            <div class={styles.percent}>
              {props.result.percent || 0}%
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
          <Show when={isShowingResult()}>
            <PollProgressLine progress={fillWidth()} />
          </Show>
        </Transition>

        <Transition name='fade-2'>
          <Show when={isShowingResult()}>
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

const PollProgressLine = (props: {progress: number}) => {
  return (
    <div class={styles.labelProgress}>
      <div class={styles.labelProgressFill} style={{'--fill-width': props.progress}}/>
    </div>
  );
};
