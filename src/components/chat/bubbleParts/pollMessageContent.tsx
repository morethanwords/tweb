import ripple from '@components/ripple';
import Space from '@components/space';
import {StaticCheckbox} from '@components/staticCheckbox';
import {keepMe} from '@helpers/keepMe';
import formatNumber from '@helpers/number/formatNumber';
import createMiddleware from '@helpers/solid/createMiddleware';
import {TextWithEntities} from '@layer';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import defineSolidElement, {PassedProps} from '@lib/solidjs/defineSolidElement';
import {createEffect, createSignal, onCleanup, onMount, Show} from 'solid-js';
import styles from './pollMessageContent.module.scss';
import {requestRAF} from '@helpers/solid/requestRAF';
import {Transition} from 'solid-transition-group';

keepMe(ripple);


if(import.meta.hot) import.meta.hot.accept();

type Props = {

};


const PollOption = (props: {
  clickable?: boolean;
  text: TextWithEntities;
}) => {
  const [fillWidth, setFillWidth] = createSignal(0);
  const [toggled, setToggled] = createSignal(true);

  const middleware = createMiddleware().get();

  createEffect(() => {
    if(!toggled()) return;
    requestRAF(() => {
      setFillWidth(0.4);
    });
    onCleanup(() => {
      setFillWidth(0);
    })
  });

  return (
    <div class={styles.pollOption} classList={{[styles.hasImage]: true}}>
      <div class={styles.clickableArea} use:ripple={props.clickable} onClick={() => setToggled(p => !p)} />
      <div class={styles.checkContainer}>
        <Transition name='fade-2'>
          <Show when={!toggled()}>
            <StaticCheckbox class={styles.checkbox} />
          </Show>
          <Show when={toggled()}>
            <div class={styles.percent}>
              35%
            </div>
          </Show>
        </Transition>
      </div>
      <div class={styles.labelRow}>
        <div class={styles.labelText}>
          {wrapRichText(props.text.text, {entities: props.text.entities, middleware})}
        </div>
        <div class={styles.labelNumber}>
          {formatNumber(42550, 0)}
        </div>


        <Transition name='fade-2'>
          <Show when={toggled()}>
            <PollProgressLine progress={fillWidth()} />
          </Show>
        </Transition>

        <Transition name='fade-2'>
          <Show when={toggled()}>
            <StaticCheckbox round class={styles.chosenCheckbox} checked />
          </Show>
        </Transition>
      </div>
      <div class={styles.optionImage}></div>
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

export const PollMessageContent = defineSolidElement({
  name: 'poll-message-content',
  component: (props: PassedProps<Props>) => {
    const options: TextWithEntities[] = [
      {
        _: 'textWithEntities',
        text: 'Option 1',
        entities: []
      },
      {
        _: 'textWithEntities',
        text: 'Option 2 more and more text here with something more and more here',
        entities: []
      },
      {
        _: 'textWithEntities',
        text: 'Option 3',
        entities: []
      },
      {
        _: 'textWithEntities',
        text: 'Option 4',
        entities: []
      }
    ]
    return (
      <>
        <Space amount='2rem' />
        {options.map((option) => (
          <PollOption text={option} />
        ))}
        <Space amount='2rem' />
      </>
    );
  }
});
