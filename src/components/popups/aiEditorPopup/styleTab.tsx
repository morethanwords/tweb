import fieldSectionStyles from '@/scss/modulePartials/fieldSectionCaption.module.scss';
import {IconTsx} from '@components/iconTsx';
import Scrollable from '@components/scrollable2';
import {Skeleton} from '@components/skeleton';
import Space from '@components/space';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import {HeightTransition} from '@helpers/solid/heightTransition';
import {I18nTsx} from '@helpers/solid/i18n';
import {useEdgeAutoScroll} from '@helpers/solid/useEdgeAutoScroll';
import classNames from '@helpers/string/classNames';
import useElementSize from '@hooks/useElementSize';
import {useScrollPosition} from '@hooks/useScrollPosition';
import {AiComposeTone} from '@layer';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {batch, createComputed, createEffect, createMemo, createResource, createSignal, For, onCleanup, Show, useContext} from 'solid-js';
import {createStore, reconcile, SetStoreFunction, unwrap} from 'solid-js/store';
import {TransitionGroup} from 'solid-transition-group';
import {usePopupContext} from '../indexTsx';
import styles from './bodyContent.module.scss';
import {AiEditorPopupContext} from './context';
import showCreateTonePopup from './createTonePopup';
import {CreatorLink} from './creatorLink';
import {useMaxSavedTones} from './limits';
import {cachedComposedMessages, CreateTone, Divider, Original, Result, Tone} from './parts';
import track from '@helpers/solid/track';
import {ComposeMessageWithAiArgs} from '@lib/appManagers/aiTonesManager';
import {
  AiComposerPromptField,
  AiComposerSection,
  useAiComposerPromptGeneration,
  useAiComposerPromptInput,
  useAiComposerPromptMaxLength
} from './composerParts';


export const StyleTab = () => {
  const {rootScope} = useHotReloadGuard();
  const popupContext = usePopupContext();
  const context = useContext(AiEditorPopupContext);
  const {
    text: originalText,
    initialTones,
    promptTextSignal: [promptText, setPromptText],
    primaryActionSignal: [, setPrimaryAction],
    resultTextSignal: [resultText],
    resultRichMessageSignal: [resultRichMessage]
  } = context;

  const hasArrows = !IS_TOUCH_SUPPORTED;

  const [emojify, setEmojify] = createSignal(false);
  const [promptPending, setPromptPending] = createSignal(false);
  const [promptSelected, setPromptSelected] = createSignal(false);
  const [tonesListEl, setTonesListEl] = createSignal<HTMLDivElement>();
  const [selectedTone, setSelectedTone] = createSignal<AiComposeTone>();

  const maxPromptLength = useAiComposerPromptMaxLength();
  const promptLength = () => [...promptText()].length;
  const canGeneratePrompt = () => (
    !!promptText().trim() &&
    promptLength() <= maxPromptLength() &&
    !promptPending()
  );
  const hasResult = () => !!(resultRichMessage() || resultText());
  const {
    appliedPrompt,
    generate: generateWithPrompt,
    reset: resetAppliedPrompt
  } = useAiComposerPromptGeneration({
    active: promptSelected,
    canGenerate: canGeneratePrompt,
    prompt: promptText
  });

  const maxSavedTones = useMaxSavedTones();

  const scrollableSize = hasArrows ? useElementSize(tonesListEl) : {width: 0, height: 0};
  const scrollLeft = hasArrows ? useScrollPosition(tonesListEl, 'x') : () => 0;
  const isScrolledLeft = () => scrollLeft() <= 1;
  const isScrolledRight = () => !tonesListEl() || tonesListEl().scrollWidth - scrollLeft() - scrollableSize.width <= 1;

  const selectedToneAuthorId = createMemo(() => {
    const tone = selectedTone();
    const peerId = tone?._ === 'aiComposeTone' ? tone.author_id?.toPeerId() : undefined;
    return peerId !== rootScope.myId ? peerId : undefined;
  });

  const [tonesResource] = createResource(
    () => initialTones ? undefined : true,
    () => rootScope.managers.aiTonesManager.getTones(),
    initialTones ? {initialValue: initialTones} as {} : undefined
  );

  const [tones, setTones] = createStore<AiComposeTone[]>([]);

  createComputed(() => {
    if(tonesResource.state !== 'ready') return;
    setTones(tonesResource());

    // keeps the original reference to the mutable tones, will basically keep the same data when switching between tabs
    context.initialTones = unwrap(tones);
  });

  const savedTones = () => tones.filter(tone => tone._ === 'aiComposeTone').length;

  if(hasArrows) {
    useEdgeAutoScroll({
      axis: () => 'horizontal',
      container: tonesListEl,
      listenTo: () => popupContext.element,
      innerThreshold: () => 32,
      outerThreshold: () => 16,
      interval: () => 320,
      startInterval: () => 800,
      startDelay: () => 200,
      padding: () => 4,
      rampFactor: () => 0.75
    });
  }

  const onSelectTone = (tone: AiComposeTone) => {
    batch(() => {
      setPromptSelected(false);
      resetAppliedPrompt();
      if(tone === selectedTone()) setSelectedTone();
      else setSelectedTone(tone);
    });
  };

  const onSelectPrompt = () => {
    const selected = !promptSelected();
    batch(() => {
      setPromptSelected(selected);
      resetAppliedPrompt();
      setSelectedTone();
      if(selected) setEmojify(false);
    });
  };

  const onPromptInput = (value: string) => {
    setPromptText(value);
    resetAppliedPrompt(value);
  };

  const setPromptInputField = useAiComposerPromptInput({
    active: promptSelected,
    onSubmit: generateWithPrompt
  });

  createEffect(() => {
    if(!promptSelected() || hasResult()) return;
    const action = {
      disabled: () => !canGeneratePrompt(),
      langKey: 'AiEditor.Generate' as const,
      onClick: generateWithPrompt
    };
    setPrimaryAction(action);
    onCleanup(() => setPrimaryAction((current) => current === action ? undefined : current));
  });

  const selectedToneSlugOrId = () => {
    const localSelectedTone = selectedTone();
    if(!localSelectedTone) return undefined;

    if(localSelectedTone._ === 'aiComposeTone') {
      // Make sure the request refires when tone data changes
      track(() => ({...localSelectedTone}));
      return localSelectedTone.id.toString();
    }

    return localSelectedTone.tone;
  };

  const getToneContextMenu = (tone: AiComposeTone) => {
    if(tone._ !== 'aiComposeTone') return undefined;

    const isSaved = !tone.pFlags.creator;

    const onEdit = useEditTone({tone, tones, setTones});
    const onShare = useShareTone({tone});
    const onDelete = useDeleteTone({tone, isSaved, setTones});

    return {
      isSaved,
      onEdit,
      onShare,
      onDelete
    };
  };

  return (
    <div>
      <div class={styles.sectionWrapper}>
        <div class={styles.section}>
          <Scrollable class={styles.tonesList} ref={setTonesListEl} axis='x' relative>
            <TransitionGroup name='fade-2' moveClass='t-move' onBeforeExit={(el) => el.classList.add(styles.exit)}>
              <Tone
                icon='prompt'
                name={<I18nTsx key='AiEditor.Prompt' />}
                selected={promptSelected()}
                onClick={onSelectPrompt}
              />
              <Show when={tonesResource.state === 'ready'}>
                <>
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
                  <Show when={savedTones() < maxSavedTones()}>
                    <CreateTone
                      onCreate={(createdTone) => {
                        tonesListEl()?.scrollTo({left: 0, behavior: 'instant'});
                        setTones(prev => [createdTone, ...prev]);
                      }}
                    />
                  </Show>
                </>
              </Show>
              <Show when={tonesResource.state === 'pending'}>
                {[1, 2, 3, 4].map(() => (
                  <div class={styles.toneSkeleton}>
                    <Skeleton.Div class={styles.toneSkeletonIcon} secondary></Skeleton.Div>
                    <Skeleton.Div class={styles.toneSkeletonText} textLine secondary></Skeleton.Div>
                  </div>
                ))}
              </Show>
            </TransitionGroup>
          </Scrollable>
        </div>
        {hasArrows && (
          <>
            <IconTsx
              class={classNames(styles.sectionArrow, styles.sectionArrowLeft)}
              classList={{
                [styles.hidden]: isScrolledLeft()
              }}
              icon='arrowhead'
            />
            <IconTsx
              class={classNames(styles.sectionArrow, styles.sectionArrowRight)}
              classList={{
                [styles.hidden]: isScrolledRight()
              }}
              icon='arrowhead'
            />
          </>
        )}
      </div>
      <Space amount='1rem' />
      <AiComposerSection>
        <TransitionGroup
          name='fade-2'
          moveClass='t-move-std'
          onBeforeExit={el => {
            if(!(el instanceof HTMLElement)) return;
            el.classList.add(styles.exit);
          }}
        >
          <Show when={promptSelected()}>
            <div class={styles.promptField}>
              <AiComposerPromptField
                instanceRef={setPromptInputField}
                label='AiEditor.PromptPlaceholder'
                maxLength={maxPromptLength()}
                onRawInput={onPromptInput}
                value={promptText()}
              />
            </div>
          </Show>
          {/* Don't care about isAppearing here, original content is always initially uncollapsed */}
          <Original
            isAppearing={false}
            text={originalText}
            onEmojify={!emojify() && !selectedTone() && !promptSelected() ?
              () => setEmojify(true) :
              undefined}
          />
          <Show when={emojify() || selectedTone() || appliedPrompt()}>
            <Divider />
            <Result
              emojify={emojify()}
              onEmojify={() => setEmojify(!emojify())}
              onPendingChange={setPromptPending}
              composeMessageWithAiArgs={{
                text: originalText,
                customPrompt: appliedPrompt(),
                toneNameOrId: selectedToneSlugOrId(),
                emojify: emojify()
              }}
            />
          </Show>
        </TransitionGroup>
      </AiComposerSection>
      <HeightTransition>
        <Show when={selectedToneAuthorId()}>
          {(authorId) => (
            <div style={{overflow: 'hidden'}}>
              <div class={fieldSectionStyles.fieldSectionCaption}>
                <I18nTsx
                  key='AiEditor.StyleBy'
                  args={[
                    <CreatorLink peerId={authorId()} onClick={() => popupContext.hide()} />
                  ]}
                />
              </div>
            </div>
          )}
        </Show>
      </HeightTransition>
    </div>
  );
};

type UseEditToneArgs = {
  tone: AiComposeTone.aiComposeTone;
  tones: AiComposeTone[];
  setTones: SetStoreFunction<AiComposeTone[]>;
};

const useEditTone = ({
  tone,
  tones,
  setTones
}: UseEditToneArgs) => {
  const {rootScope, HotReloadGuard} = useHotReloadGuard();

  if(!tone.pFlags.creator) return;

  return () => {
    showCreateTonePopup({
      HotReloadGuard,
      initialValues: {
        title: tone.title,
        emojiId: tone.emoji_id,
        prompt: tone.prompt,
        displayAuthor: !!tone.author_id
      },
      titleLangKey: 'AiEditor.NewStyle.TitleEdit',
      submitLangKey: 'Save',
      errorLangKey: 'AiEditor.NewStyle.ErrorEdit',
      onSubmit: async(payload) => {
        const updatedTone = await rootScope.managers.aiTonesManager.editTone({toneId: tone.id.toString(), ...payload});

        for(const [key] of cachedComposedMessages) {
          try {
            const keyData = JSON.parse(key) as ComposeMessageWithAiArgs;
            if(keyData.toneNameOrId.toString() === tone.id.toString()) cachedComposedMessages.delete(key);
          } catch{}
        }

        const prevTone = tones.find(t => t._ === 'aiComposeTone' && t.id.toString() === tone.id.toString());
        if(!prevTone) return;

        batch(() => {
          setTones(prev => [
            prevTone,
            ...prev.filter(t => t._ !== 'aiComposeTone' || t.id.toString() !== tone.id.toString())
          ]);
          setTones(0, reconcile(updatedTone));
        });
      }
    })
  };
};

type UseShareToneArgs = {
  tone: AiComposeTone.aiComposeTone;
};

const useShareTone = ({tone}: UseShareToneArgs) => {
  const {rootScope, showSharingPickerPopup, PaidMessagesInterceptor} = useHotReloadGuard();

  return () => {
    showSharingPickerPopup({
      onSelect: async([peer]) => {
        if(!peer) return;

        const preparedPaymentResult = await PaidMessagesInterceptor.prepareStarsForPayment({
          peerId: peer.peerId,
          messageCount: 1
        });

        if(preparedPaymentResult === PaidMessagesInterceptor.PaymentRejectedSymbol) throw new Error();

        const link = 'https://t.me/addstyle/' + tone.slug;
        rootScope.managers.appMessagesManager.sendText({
          peerId: peer.peerId,
          threadId: peer.threadId,
          replyToMonoforumPeerId: peer.monoforumThreadId,
          text: link,
          confirmedPaymentResult: preparedPaymentResult
        });
      }
    });
  };
};

type UseDeleteToneArgs = {
  tone: AiComposeTone.aiComposeTone;
  isSaved: boolean;
  setTones: SetStoreFunction<AiComposeTone[]>;
};

const useDeleteTone = ({
  tone,
  isSaved,
  setTones
}: UseDeleteToneArgs) => {
  const {rootScope, toastNew, confirmationPopup} = useHotReloadGuard();

  return async() => {
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
        langPackKey: 'AiEditor.StyleRemoveError'
      });
    }
  };
};
