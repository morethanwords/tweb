import fieldSectionStyles from '@/scss/modulePartials/fieldSectionCaption.module.scss';
import {IconTsx} from '@components/iconTsx';
import Scrollable from '@components/scrollable2';
import {Skeleton} from '@components/skeleton';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import {HeightTransition} from '@helpers/solid/heightTransition';
import {I18nTsx} from '@helpers/solid/i18n';
import {useEdgeAutoScroll} from '@helpers/solid/useEdgeAutoScroll';
import classNames from '@helpers/string/classNames';
import useElementSize from '@hooks/useElementSize';
import {useObserveResize} from '@hooks/useObserveResize';
import {useScrollPosition} from '@hooks/useScrollPosition';
import {AiComposeTone} from '@layer';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {batch, createComputed, createEffect, createMemo, createResource, createSignal, For, onCleanup, Show, useContext} from 'solid-js';
import {createStore, reconcile, SetStoreFunction, unwrap} from 'solid-js/store';
import {TransitionGroup} from 'solid-transition-group';
import {usePopupContext} from '../indexTsx';
import styles from './bodyContent.module.scss';
import {AiEditorPopupContext, takeSavedSendStyle, useAiEditorRequest} from './context';
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
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import getAiComposeToneKey from '@appManagers/utils/aiTones/getAiComposeToneKey';


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

  const savedSendStyle = takeSavedSendStyle(context, (style) => !style.translateTo && !style.proofRead);
  let toneToSelect = !savedSendStyle?.customPrompt ? savedSendStyle?.toneNameOrId : undefined;

  const [emojify, setEmojify] = createSignal(!!savedSendStyle?.emojify);
  const [promptPending, setPromptPending] = createSignal(false);
  const [promptSelected, setPromptSelected] = createSignal(!!savedSendStyle?.customPrompt);
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
  // * the distance from the row's inline start: the right edge in RTL
  const scrollFromStart = hasArrows ? useScrollPosition(tonesListEl, 'x') : () => 0;
  const isScrolledToStart = () => scrollFromStart() <= 1;
  const isScrolledToEnd = () => !tonesListEl() || tonesListEl().scrollWidth - scrollFromStart() - scrollableSize.width <= 1;

  // * styles that do not all fit widen, from the narrowest they get (`--tone-min-width`), so that the last one in sight
  // * is cut in half at the row's end: that shows the row goes on. Those that fit stretch over it by themselves
  const fitTones = () => {
    const list = tonesListEl();
    if(!list) return;
    const style = getComputedStyle(list);
    const minWidth = parseFloat(style.getPropertyValue('--tone-min-width'));
    const gap = parseFloat(style.columnGap) || 0;
    const width = list.clientWidth - parseFloat(style.paddingInlineStart);
    const count = [...list.children].filter((child) => !child.classList.contains(styles.exit)).length;
    if(count * minWidth + (count - 1) * gap <= width) {
      list.style.removeProperty('--tone-width');
      return;
    }

    const whole = Math.max(1, Math.floor((width - minWidth / 2) / (minWidth + gap)));
    list.style.setProperty('--tone-width', (width - whole * gap) / (whole + .5) + 'px');
  };
  useObserveResize(tonesListEl, fitTones);
  createEffect(() => {
    const list = tonesListEl();
    if(!list) return;
    const observer = new MutationObserver(fitTones);
    observer.observe(list, {childList: true});
    onCleanup(() => observer.disconnect());
  });

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

    if(toneToSelect) {
      const id = toneToSelect;
      toneToSelect = undefined;
      setSelectedTone(tones.find((tone) => getAiComposeToneKey(tone) === id));
    }
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

  if(savedSendStyle?.customPrompt) {
    setPromptText(savedSendStyle.customPrompt);
    generateWithPrompt();
  }

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

    // Make sure the request refires when tone data changes
    if(localSelectedTone._ === 'aiComposeTone') track(() => ({...localSelectedTone}));
    return getAiComposeToneKey(localSelectedTone);
  };

  // * what is asked with a prompt is the prompt applied last, not one being typed, nor nothing while it is asked again
  const [lastPrompt, setLastPrompt] = createSignal<string>();
  createComputed(() => {
    const prompt = appliedPrompt();
    if(prompt) setLastPrompt(prompt);
  });
  useAiEditorRequest(context, () => ({
    text: originalText,
    customPrompt: promptSelected() ? lastPrompt() : undefined,
    toneNameOrId: selectedToneSlugOrId(),
    emojify: emojify()
  }));

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
      <AiComposerSection>
        {/* the styles to choose from head the section of the text they are tried on */}
        <div class={styles.sectionWrapper}>
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
          {hasArrows && (
            <>
              <IconTsx
                class={classNames(styles.sectionArrow, styles.sectionArrowStart)}
                classList={{
                  [styles.hidden]: isScrolledToStart()
                }}
                icon='arrowhead'
              />
              <IconTsx
                class={classNames(styles.sectionArrow, styles.sectionArrowEnd)}
                classList={{
                  [styles.hidden]: isScrolledToEnd()
                }}
                icon='arrowhead'
              />
            </>
          )}
        </div>
        {/* what leaves takes its place at the top of this part, not over the styles */}
        <div class={styles.tonesRest}>
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
            {/* the styles end under the prompt they are written with, moving down as it comes */}
            <div class={styles.tonesBorder} />
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
        </div>
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
        const managers = bindManagersToSession(rootScope.managers);
        if(!peer) return;

        const preparedPaymentResult = await PaidMessagesInterceptor.prepareStarsForPayment({
          peerId: peer.peerId,
          messageCount: 1
        });

        if(preparedPaymentResult === PaidMessagesInterceptor.PaymentRejectedSymbol) throw new Error();

        const link = 'https://t.me/addstyle/' + tone.slug;
        managers.appMessagesManager.sendText({
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
    const managers = bindManagersToSession(rootScope.managers);
    try {
      if(isSaved) {
        await managers.aiTonesManager.removeSavedTone(tone.id);
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
        await managers.aiTonesManager.deleteTone(tone.id.toString());
      }

      setTones(prev => prev.filter(t => t._ !== 'aiComposeTone' || t.id !== tone.id))
    } catch{
      toastNew({
        langPackKey: 'AiEditor.StyleRemoveError'
      });
    }
  };
};
