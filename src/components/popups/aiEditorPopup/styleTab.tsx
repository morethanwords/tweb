import Scrollable from '@components/scrollable2';
import Space from '@components/space';
import {HeightTransition} from '@helpers/solid/heightTransition';
import {useEdgeAutoScroll} from '@helpers/solid/useEdgeAutoScroll';
import {AiComposeTone} from '@layer';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createResource, createSignal, For, Show, useContext} from 'solid-js';
import styles from './bodyContent.module.scss';
import {AiEditorPopupContext} from './context';
import {CreateTone, Divider, Original, Result, Tone, useIsAppearing} from './parts';
import {TransitionGroup} from 'solid-transition-group';


export const StyleTab = () => {
  const {rootScope} = useHotReloadGuard();
  const [emojify, setEmojify] = createSignal(false);
  const [tonesListEl, setTonesListEl] = createSignal<HTMLDivElement>();
  const [selectedTone, setSelectedTone] = createSignal<AiComposeTone>();
  const [runningAnimations, setRunningAnimations] = createSignal(0);

  const {text: originalText} = useContext(AiEditorPopupContext);

  // TODO: Handle errors
  const [tones, {mutate: mutateTones}] = createResource(() => rootScope.managers.aiTonesManager.getTones());

  useEdgeAutoScroll({
    axis: () => 'horizontal',
    container: tonesListEl,
    innerThreshold: () => 32,
    outerThreshold: () => 16,
    interval: () => 320,
    startInterval: () => 800,
    startDelay: () => 200,
    padding: () => 4,
    rampFactor: () => 0.75
  });

  const onSelectTone = (tone: AiComposeTone) => {
    if(tone === selectedTone()) setSelectedTone()
    else setSelectedTone(tone);
  };

  const selectedToneSlugOrId = () => {
    const localSelectedTone = selectedTone();
    if(!localSelectedTone) return undefined;
    if(localSelectedTone._ === 'aiComposeTone') return localSelectedTone.id.toString();
    return localSelectedTone.tone;
  };

  return (
    <div>
      <div class={styles.section}>
        <Scrollable class={styles.tonesList} ref={setTonesListEl} axis='x' relative>
          <CreateTone onCreate={(createdTone) => {
            mutateTones([createdTone, ...tones()]);
          }} />
          <TransitionGroup name='fade-2' moveClass='t-move'>
            <For each={tones()}>
              {(tone) => (
                <Tone
                  docId={tone.emoji_id}
                  name={tone.title}
                  selected={tone === selectedTone()}
                  onClick={[onSelectTone, tone]}
                />
              )}
            </For>
          </TransitionGroup>
        </Scrollable>
      </div>
      <Space amount='1rem' />
      <div class={styles.tabContent}>
        <Original text={originalText} onEmojify={!emojify() && !selectedTone() ? () => setEmojify(true) : undefined} />
        <HeightTransition onRunningAnimations={setRunningAnimations}>
          <Show when={emojify() || selectedTone()}>
            {(_) => {
              const isAppearing = useIsAppearing(() => runningAnimations() > 0);

              return (
                <div style={{overflow: 'hidden'}}>
                  <Divider />
                  <Result
                    isAppearing={isAppearing()}
                    emojify={emojify()}
                    onEmojify={() => setEmojify(!emojify())}
                    composeMessageWithAiArgs={{
                      text: originalText,
                      toneNameOrId: selectedToneSlugOrId(),
                      emojify: emojify()
                    }}
                  />
                </div>
              );
            }}
          </Show>
        </HeightTransition>
      </div>
    </div>
  );
};
