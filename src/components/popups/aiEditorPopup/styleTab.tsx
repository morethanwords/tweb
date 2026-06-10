import Scrollable from '@components/scrollable2';
import Space from '@components/space';
import {HeightTransition} from '@helpers/solid/heightTransition';
import {useEdgeAutoScroll} from '@helpers/solid/useEdgeAutoScroll';
import {AiComposeTone} from '@layer';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {batch, createComputed, createResource, createSignal, For, Show, useContext} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
import {TransitionGroup} from 'solid-transition-group';
import styles from './bodyContent.module.scss';
import {AiEditorPopupContext} from './context';
import showCreateTonePopup from './createTonePopup';
import {CreateTone, Divider, Original, Result, Tone, useIsAppearing} from './parts';


export const StyleTab = () => {
  const {rootScope, HotReloadGuard, showSharingPickerPopup, toastNew, confirmationPopup} = useHotReloadGuard();

  const [emojify, setEmojify] = createSignal(false);
  const [tonesListEl, setTonesListEl] = createSignal<HTMLDivElement>();
  const [selectedTone, setSelectedTone] = createSignal<AiComposeTone>();
  const [runningAnimations, setRunningAnimations] = createSignal(0);

  const {text: originalText} = useContext(AiEditorPopupContext);

  // TODO: Handle errors
  const [tonesResource] = createResource(
    () => rootScope.managers.aiTonesManager.getTones()
  );

  const [tones, setTones] = createStore<AiComposeTone[]>([]);

  createComputed(() => {
    if(tonesResource.state !== 'ready') return;
    setTones(tonesResource());
  });

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

  const getToneContextMenu = (tone: AiComposeTone) => {
    if(tone._ !== 'aiComposeTone') return undefined;

    const isSaved = !tone.pFlags.creator;

    return {
      isSaved,
      onEdit: () => {
        showCreateTonePopup({
          HotReloadGuard,
          initialValues: {
            title: tone.title,
            emojiId: tone.emoji_id,
            prompt: tone.prompt
          },
          titleLangKey: 'AiEditor.NewStyle.TitleEdit',
          submitLangKey: 'Save',
          onSubmit: async(payload) => {
            const updatedTone = await rootScope.managers.aiTonesManager.editTone({toneId: tone.id.toString(), ...payload});
            const prevTone = tones.find(t => t._ === 'aiComposeTone' && t.id.toString() === tone.id.toString());
            batch(() => {
              setTones(prev => [
                prevTone,
                ...prev.filter(t => t._ !== 'aiComposeTone' || t.id.toString() !== tone.id.toString())
              ]);
              setTones(0, reconcile(updatedTone));
            });
          }
        })
      },
      onShare: () => {
        showSharingPickerPopup({
          onSelect: ([peer]) => {
            if(!peer) return;
            const link = 'https://t.me/addstyle/' + tone.slug;
            rootScope.managers.appMessagesManager.sendText({
              peerId: peer.peerId,
              threadId: peer.threadId,
              replyToMonoforumPeerId: peer.monoforumThreadId,
              text: link
            });
          }
        });
      },
      onDelete: async() => {
        try {
          if(isSaved) {
            await rootScope.managers.aiTonesManager.removeSavedTone(tone.id);
          } else {
            try {
              await confirmationPopup({
                titleLangKey: 'AiEditor.DeleteStyle.Title',
                descriptionLangKey: 'AiEditor.DeleteStyle.Description',
                button: {langKey: 'Delete', isDanger: true}
              });
            } catch{
              return;
            }
            await rootScope.managers.aiTonesManager.deleteTone(tone.id.toString());
          }

          setTones(prev => prev.filter(t => t._ !== 'aiComposeTone' || t.id !== tone.id))
        } catch{
          toastNew({
            langPackKey: 'AiEditor.DeleteStyle.Failed'
          });
        }
      }
    };
  };

  return (
    <div>
      <div class={styles.section}>
        <Scrollable class={styles.tonesList} ref={setTonesListEl} axis='x' relative>
          <CreateTone onCreate={(createdTone) => {
            setTones(prev => [createdTone, ...prev]);
          }} />
          <TransitionGroup name='fade-2' moveClass='t-move'>
            <For each={tones}>
              {(tone) => (
                <Tone
                  docId={tone.emoji_id}
                  name={tone.title}
                  selected={tone === selectedTone()}
                  onClick={[onSelectTone, tone]}
                  withContextMenu={getToneContextMenu(tone)}
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
