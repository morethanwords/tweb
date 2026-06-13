import {AutoHeight} from '@components/autoHeight';
import {IconTsx} from '@components/iconTsx';
import Scrollable from '@components/scrollable2';
import {Skeleton} from '@components/skeleton';
import Space from '@components/space';
import DEBUG from '@config/debug';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import {useEdgeAutoScroll} from '@helpers/solid/useEdgeAutoScroll';
import classNames from '@helpers/string/classNames';
import useElementSize from '@hooks/useElementSize';
import {useScrollPosition} from '@hooks/useScrollPosition';
import {AiComposeTone} from '@layer';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {batch, createComputed, createResource, createSignal, For, Show, useContext} from 'solid-js';
import {createStore, reconcile, SetStoreFunction} from 'solid-js/store';
import {Transition, TransitionGroup} from 'solid-transition-group';
import {usePopupContext} from '../indexTsx';
import styles from './bodyContent.module.scss';
import {AiEditorPopupContext} from './context';
import showCreateTonePopup from './createTonePopup';
import {useMaxSavedTones} from './limits';
import {CreateTone, Divider, Original, Result, Tone} from './parts';


const simulateDelay = DEBUG ? 400 : 0;
const simulateRandomDelay = DEBUG ? () => Math.floor(Math.random() * 1000) : 0;

export const StyleTab = () => {
  const {rootScope} = useHotReloadGuard();
  const popupContext = usePopupContext();
  const context = useContext(AiEditorPopupContext);
  const {text: originalText, initialTones} = context;

  const hasArrows = !IS_TOUCH_SUPPORTED;

  let autoHeightRef: HTMLDivElement;

  const [emojify, setEmojify] = createSignal(false);
  const [tonesListEl, setTonesListEl] = createSignal<HTMLDivElement>();
  const [selectedTone, setSelectedTone] = createSignal<AiComposeTone>();

  const maxSavedTones = useMaxSavedTones();

  const scrollableSize = hasArrows ? useElementSize(tonesListEl) : {width: 0, height: 0};
  const scrollLeft = hasArrows ? useScrollPosition(tonesListEl, 'x') : () => 0;
  const isScrolledLeft = () => scrollLeft() <= 1;
  const isScrolledRight = () => !tonesListEl() || tonesListEl().scrollWidth - scrollLeft() - scrollableSize.width <= 1;

  const [tonesResource] = createResource(
    () => initialTones ? undefined : true,
    () => {
      // if(simulateDelay) return pause(simulateDelay).then(() => rootScope.managers.aiTonesManager.getTones())
      // if(simulateRandomDelay) return pause(simulateRandomDelay()).then(() => rootScope.managers.aiTonesManager.getTones())
      return rootScope.managers.aiTonesManager.getTones();
    },
    initialTones ? {initialValue: initialTones} as {} : undefined,
  );

  const [tones, setTones] = createStore<AiComposeTone[]>([]);

  createComputed(() => {
    if(tonesResource.state !== 'ready') return;
    setTones(tonesResource());
    context.initialTones = tonesResource();
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
          <Transition name='fade-2' mode='outin'>
            <Show when={tonesResource.state === 'ready'} fallback={
              <Scrollable class={styles.tonesList} ref={setTonesListEl} axis='x' relative>
                {/* WTF is with this fallback={...} */}
                <Show when={tonesResource.state === 'pending'}>
                  {[1, 2, 3, 4].map(() => (
                    <div class={styles.toneSkeleton}>
                      <Skeleton.Div class={styles.toneSkeletonIcon} secondary></Skeleton.Div>
                      <Skeleton.Div class={styles.toneSkeletonText} textLine secondary></Skeleton.Div>
                    </div>
                  ))}
                </Show>
              </Scrollable>
            }>
              <Scrollable class={styles.tonesList} ref={setTonesListEl} axis='x' relative>
                <TransitionGroup name='fade-2' moveClass='t-move' onBeforeExit={(el) => el.classList.add(styles.exit)}>
                  <Show when={savedTones() < maxSavedTones()}>
                    <CreateTone
                      onCreate={(createdTone) => {
                        setTones(prev => [createdTone, ...prev]);
                      }}
                    />
                  </Show>
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
            </Show>
          </Transition>
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
      <AutoHeight ref={autoHeightRef} outerClass={styles.tabContent}>
        <TransitionGroup
          name='fade-2'
          moveClass='t-move-std'
          onBeforeExit={el => {
            if(!(el instanceof HTMLElement) || !autoHeightRef) return;
            el.classList.add(styles.exit);
          }}
        >
          {/* Don't care about isAppearing here, original content is always initially uncollapsed */}
          <Original isAppearing={false} text={originalText} onEmojify={!emojify() && !selectedTone() ? () => setEmojify(true) : undefined} />
          <Show when={emojify() || selectedTone()}>
            <Divider />
            <Result
              emojify={emojify()}
              onEmojify={() => setEmojify(!emojify())}
              composeMessageWithAiArgs={{
                text: originalText,
                toneNameOrId: selectedToneSlugOrId(),
                emojify: emojify()
              }}
            />
          </Show>
        </TransitionGroup>
      </AutoHeight>
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
