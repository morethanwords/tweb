import {AnimationItemGroup} from '@components/animationIntersector';
import {AppMediaViewerStaticTargetType} from '@components/appMediaViewerStatic';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import InputField from '@components/inputField';
import type LazyLoadQueue from '@components/lazyLoadQueue';
import {useCreatePollLimits} from '@components/popups/createPoll/useCreatePollLimits';
import {RemainingTime} from '@components/remainingTime';
import ripple from '@components/ripple';
import Space from '@components/space';
import PhotoTsx from '@components/wrappers/photoTsx';
import VideoTsx from '@components/wrappers/videoTsx';
import {setCaretAtEnd} from '@helpers/dom/setCaretAt';
import SuperIntersectionObserver from '@helpers/dom/superIntersectionObserver';
import {keepMe} from '@helpers/keepMe';
import mediaSizes from '@helpers/mediaSizes';
import {attachHotClassName} from '@helpers/solid/classname';
import createMiddleware from '@helpers/solid/createMiddleware';
import {I18nTsx} from '@helpers/solid/i18n';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import type {ChatAutoDownloadSettings} from '@hooks/useAutoDownloadSettings';
import {Document, Message, MessageMedia, Photo, Poll, PollResults} from '@layer';
import {ChatRights} from '@lib/appManagers/appChatsManager';
import {sliceTextWithEntities} from '@lib/richTextProcessor/sliceTextWithEntities';
import wrapDraftText from '@lib/richTextProcessor/wrapDraftText';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {batch, createEffect, createMemo, createSelector, createSignal, For, Match, Show, Switch} from 'solid-js';
import {createStore, reconcile, unwrap} from 'solid-js/store';
import {Transition, TransitionGroup} from 'solid-transition-group';
import {AddOption} from './AddOption';
import {PollMessageContentPropsContext} from './context';
import {AutoStartedConfetti, AvatarGroup, Explanation, GeoPreview, PollType, PollVotes} from './parts';
import {PollOption} from './PollOption';
import styles from './styles.module.scss';
import {usePollDerivedProps} from './usePollDerivedProps';
import {usePollMutations} from './usePollMutations';
import {usePollOptionsStore} from './usePollOptionsStore';
import {attachSpoilerOverlay, dataPollViewerIdx, hasSelectedCorrectAnswers, NewOptionValues} from './utils';


keepMe(ripple);
keepMe(dataPollViewerIdx);

export type PollMessageContentProps = {
  element: HTMLElement;
  isOutgoing?: boolean;
  poll: Poll;
  peerId: PeerId;
  message: Message.message;
  results: PollResults;
  media: MessageMedia.messageMediaPoll;
  autoDownload?: ChatAutoDownloadSettings;
  lazyLoadQueue?: false | LazyLoadQueue;
  animationGroup?: AnimationItemGroup;
  observer?: SuperIntersectionObserver;
  canSend: (rights: ChatRights) => Promise<boolean>;
  loadPromises: Promise<any>[];
  controls: Partial<PollMessageContentControls>;
};

export type PollMessageContentControls = {
  openMediaViewer: (idx: number) => void;
  highlightAnswer: (idx: number) => void;
  highlightAnswerWithTimeout: (idx: number, timeout: number) => void;
};

type MediaViewerPayloadIndexes = {
  description?: number;
  explanation?: number;
  options: Map<number, number>;
};

export const PollMessageContent =
  (props: PollMessageContentProps) => {
    attachHotClassName(props.element, styles.container);

    // ----- Setup / external dependencies -----
    const {rootScope, AppMediaViewerStatic, appSidebarRight, AppPollResultsTab, TranslatableMessageTsx, DocumentTsx} = useHotReloadGuard();
    const {maxOptionLength} = useCreatePollLimits();
    const middleware = createMiddleware().get();

    // ----- Local state -----
    const [explanationToggled, setExplanationToggled] = createSignal(false);
    const [chosenIndexes, setChosenIndexes] = createSignal<number[]>([]);
    const [canFooterBeClickable, setCanFooterBeClickable] = createSignal(false);
    const [isAddingNewOptionActive, setIsAddingNewOptionActive] = createSignal(false);
    const [newOption, setNewOption] = createStore<NewOptionValues>({
      text: '',
      entities: []
    });
    const [descriptionElement, setDescriptionElement] = createSignal<HTMLDivElement>();
    const [isConfettiActive, setIsConfettiActive] = createSignal(false);
    const [highlightedIndexes, setHighlightedIndexes] = createSignal<number[]>([]);
    const [slowHighlightedIndexes, setSlowHighlightedIndexes] = createSignal<number[]>([]);

    let inputField: InputField;
    const elementByIndexMap = new Map<number, HTMLElement>();

    // ----- Poll options store & derived props -----
    const [pollOptions] = usePollOptionsStore({
      props,
      userId: rootScope.myId
    });

    const {
      question,
      descriptionText,
      descriptionEntities,
      allowMultipleAnswers,
      hasCorrectAnswer,
      showWhoVoted,
      closed,
      hideResults,
      closesAtTimestamp,
      votersCount,
      recentVoters,
      hasMediaInOptions,
      hasExplanation,
      hasSelectedSomething,
      isShowingResult,
      hasTypedNewOption,
      canShowAddOption,
      canShowCloseTimer,
      canShowViewResults,
      willFooterBeClickable,
      explanationPhoto,
      explanationVideo,
      explanationDocument,
      explanationGeo,
      descriptionPhoto,
      descriptionVideo,
      descriptionDocument,
      descriptionGeo,
      getOverridenMessage,
      initialIdxFromShuffledIdx,
      getResultForOption,
      getPhotoForOption,
      getVideoForOption,
      getStickerForOption,
      getGeoForOption
    } = usePollDerivedProps({
      props,
      pollOptions,
      chosenIndexes,
      newOptionText: () => newOption.text
    });

    const isChecked = createSelector(chosenIndexes, (index: number, indices) => indices.includes(index));

    setCanFooterBeClickable(willFooterBeClickable());

    // ----- Mutations -----
    const resetInteractiveState = () => batch(() => {
      setChosenIndexes([]);
      setIsAddingNewOptionActive(false);
      setNewOption(reconcile({text: '', entities: []}));
      inputField?.setValueSilently('');
    });

    const {
      sendVoteMutation,
      wrappedSendVote,
      delayedSendVotePending,
      addOptionMutation,
      wrappedAddOption
    } = usePollMutations({
      getOverridenMessage,
      isShowingResult,
      initialIdxFromShuffledIdx,
      newOption,
      onSuccess: resetInteractiveState
    });

    // Make the footer unclickable immediately when there are pending requests
    const isFooterClickable = createMemo(() => canFooterBeClickable() && !sendVoteMutation.isPending() && !addOptionMutation.isPending() && newOption.attachment?.type !== 'pending');

    // ----- Media viewer payload -----
    const mediaViewerPayload = createMemo(() => {
      let idxSeed = 0;

      const media: (Photo.photo | Document.document)[] = [];
      const indexes: MediaViewerPayloadIndexes = {
        options: new Map()
      };

      if(descriptionPhoto() || descriptionVideo()) {
        media.push(descriptionPhoto() || descriptionVideo());
        indexes.description = idxSeed++;
      }

      if(explanationPhoto() || explanationVideo()) {
        media.push(explanationPhoto() || explanationVideo());
        indexes.explanation = idxSeed++;
      }

      props.poll.answers.forEach((option, idx) => {
        const photo = getPhotoForOption(idx);
        const video = getVideoForOption(idx);
        if(photo || video) {
          media.push(photo || video);
          indexes.options.set(idx, idxSeed++);
        }
      });

      return {media, indexes};
    });

    // ----- Event handlers -----
    const handleToggle = (index: number) => {
      if(!allowMultipleAnswers()) {
        wrappedSendVote([index]);
        return;
      }

      setChosenIndexes(prev => {
        if(prev.includes(index)) {
          return prev.filter(i => i !== index);
        } else {
          return [...prev, index];
        }
      });
    };

    const handleNewOptionChanged = (values: Partial<NewOptionValues>) => batch(() => {
      if('attachment' in values) setNewOption({attachment: values.attachment});

      if(!('text' in values && 'entities' in values)) return;

      const sliced = sliceTextWithEntities(values.text ?? '', values.entities ?? [], 0, maxOptionLength());
      setNewOption(sliced);
      if(sliced.text.length < inputField?.value.length) {
        inputField?.setValueSilently(
          wrapDraftText(sliced.text, {entities: sliced.entities, middleware}),
        );
        setCaretAtEnd(inputField?.input);
      }
    });

    const openViewResults = () => {
      if(!appSidebarRight.isTabExists(AppPollResultsTab)) {
        appSidebarRight.createTab(AppPollResultsTab).open(getOverridenMessage());
      } else {
        appSidebarRight.toggleSidebar(true);
      }
    };

    const onFooterClick = wrapAsyncClickHandler(async() => {
      if(canShowViewResults()) openViewResults();
      else if(hasSelectedSomething()) await sendVoteMutation.mutateAsync(chosenIndexes());
      else if(hasTypedNewOption()) await wrappedAddOption();
    });

    // ----- Effects & subscriptions -----
    subscribeOn(rootScope)('poll_update', ({poll, results}) => {
      if(poll.id !== props.poll.id) return;

      props.poll = poll;
      props.results = results;

      if(poll.pFlags.quiz && hasSelectedCorrectAnswers(poll)) {
        setIsConfettiActive(true);
      }
    });

    createEffect(() => {
      if(!descriptionElement()) return;
      attachSpoilerOverlay(descriptionElement(), props);
    });

    // ----- Imperative controls -----
    props.controls.openMediaViewer = (idx: number) => {
      const getTarget = (idx: number): AppMediaViewerStaticTargetType => ({
        media: mediaViewerPayload().media[idx],
        element: elementByIndexMap.get(idx)?.querySelector('.media-video, .media-photo'),
        fromId: props.message.fromId,
        timestamp: props.message.date,
        peerId: props.message.peerId,
        mid: props.message.mid
      });

      new AppMediaViewerStatic().openMedia({
        allTargets: mediaViewerPayload().media.map((_, idx) => getTarget(idx)),
        index: idx,
        fromRight: 0,
        ...getTarget(idx)
      });
    };

    let highlightedTimeout: number;

    props.controls.highlightAnswer = (idx?: number | null) => {
      self.clearTimeout(highlightedTimeout);
      setSlowHighlightedIndexes([]);

      if(typeof idx === 'number') {
        setHighlightedIndexes([idx]);
      } else {
        setHighlightedIndexes([]);
      }
    };

    props.controls.highlightAnswerWithTimeout = (idx: number, timeout: number) => {
      self.clearTimeout(highlightedTimeout);
      setSlowHighlightedIndexes([idx]);
      highlightedTimeout = self.setTimeout(() => setSlowHighlightedIndexes([]), timeout);
    };

    return (
      <PollMessageContentPropsContext.Provider value={props}>
        <Show when={isConfettiActive()}>
          <AutoStartedConfetti onEnd={() => setIsConfettiActive(false)} />
        </Show>
        <Show when={descriptionPhoto() || descriptionVideo() || descriptionGeo()}>
          <div class={styles.pollDescriptionMediaWrapper}>
            <div class={styles.pollDescriptionMedia} use:dataPollViewerIdx={[mediaViewerPayload().indexes.description, elementByIndexMap]}>
              <Switch>
                <Match when={descriptionPhoto()}>
                  <PhotoTsx
                    photo={descriptionPhoto()}
                    loadPromises={unwrap(props.loadPromises)}
                    autoDownloadSize={props.autoDownload?.photo}
                    lazyLoadQueue={unwrap(props.lazyLoadQueue)}
                  />
                </Match>
                <Match when={descriptionVideo()}>
                  <VideoTsx
                    doc={descriptionVideo()}
                    loadPromises={unwrap(props.loadPromises)}
                    group={props.animationGroup}
                    autoDownload={unwrap(props.autoDownload)}
                    boxWidth={mediaSizes.active.regular.width}
                    boxHeight={mediaSizes.active.regular.height}
                    withPreview
                    lazyLoadQueue={unwrap(props.lazyLoadQueue) || undefined}
                    observer={unwrap(props.observer)}
                  />
                </Match>
                <Match when={descriptionGeo()}>
                  <GeoPreview
                    class={styles.geo}
                    geo={descriptionGeo()}
                  />
                </Match>
              </Switch>
            </div>
          </div>
        </Show>
        <Show when={descriptionDocument() && !descriptionPhoto() && !descriptionVideo()}>
          <div class={styles.pollDocumentWrapper}>
            <DocumentTsx
              message={props.message}
              doc={descriptionDocument()}
              slot={0.1}
              loadPromises={unwrap(props.loadPromises)}
              lazyLoadQueue={unwrap(props.lazyLoadQueue) || undefined}
              autoDownloadSize={props.autoDownload?.file}
              sizeType='documentName'
              canTranscribeVoice={false}
            />
          </div>
        </Show>
        <Show when={descriptionText()}>
          <div ref={setDescriptionElement} class={styles.description}>
            <TranslatableMessageTsx
              peerId={props.peerId}
              textWithEntities={{_: 'textWithEntities', text: descriptionText(), entities: unwrap(descriptionEntities())}}
              richTextOptions={{middleware: createMiddleware().get(), loadPromises: unwrap(props.loadPromises)}}
            />
          </div>
        </Show>
        <div class={styles.header}>
          <div class={styles.headerTitleContainer}>
            <div class={styles.headerTitle}>
              <TranslatableMessageTsx
                peerId={props.peerId}
                textWithEntities={unwrap(question())}
                richTextOptions={{middleware, loadPromises: unwrap(props.loadPromises)}}
              />
            </div>
            <div class={styles.headerSubtitle}>
              <PollType closed={closed()} hasCorrectAnswer={hasCorrectAnswer()} showWhoVoted={showWhoVoted()} />
              <Transition name='fade-2'>
                <Show when={isShowingResult() && recentVoters().length > 0}>
                  <AvatarGroup peerIds={recentVoters()} />
                </Show>
              </Transition>
            </div>
          </div>

          <Show when={hasExplanation()}>
            <ButtonIconTsx icon='lamp' onClick={() => setExplanationToggled(p => !p)} />
          </Show>
        </div>

        <Show when={explanationToggled()}>
          <Explanation
            text={props.results?.solution}
            entities={props.results?.solution_entities}
            photo={explanationPhoto()}
            video={explanationVideo()}
            document={explanationDocument()}
            geo={explanationGeo()}
            pollViewerPayload={[mediaViewerPayload().indexes.explanation, elementByIndexMap]}
          />
        </Show>

        <TransitionGroup name='fade-2' moveClass='t-move'>
          <For each={pollOptions}>
            {(option, index) => {
              const initialIdx = createMemo(() => initialIdxFromShuffledIdx(index()));

              return (
                <PollOption
                  text={option.text}
                  withMedia={hasMediaInOptions()}
                  photo={getPhotoForOption(initialIdx())}
                  video={getVideoForOption(initialIdx())}
                  sticker={getStickerForOption(initialIdx())}
                  geo={getGeoForOption(initialIdx())}
                  allowMultipleAnswers={allowMultipleAnswers()}
                  hasCorrectAnswer={hasCorrectAnswer()}
                  checked={isChecked(index())}
                  onToggle={() => handleToggle(index())}
                  pollViewerPayload={[mediaViewerPayload().indexes.options.get(initialIdx()), elementByIndexMap]}
                  initialIdx={initialIdx()}
                  result={getResultForOption(initialIdx())}
                  isPendingVote={delayedSendVotePending()}
                  hideResults={hideResults()}
                  highlighted={highlightedIndexes().includes(initialIdx())}
                  slowHighlighted={slowHighlightedIndexes().includes(initialIdx())}
                />
              );
            }}
          </For>
        </TransitionGroup>

        <Show when={canShowAddOption()}>
          <div style={{overflow: 'hidden'}}>
            <AddOption
              inputFieldRef={(value: InputField) => void (inputField = value)}
              value={newOption.text}
              attachment={newOption.attachment}
              onPartialChange={handleNewOptionChanged}
              onEnter={wrappedAddOption}
              active={isAddingNewOptionActive()}
              onActiveChange={setIsAddingNewOptionActive}
              isPending={addOptionMutation.isPending()}
            />
          </div>
        </Show>

        <Space amount='0.25rem' />
        <div class={styles.footer}>
          <div
            class={styles.footerButton}
            classList={{
              [styles.clickable]: isFooterClickable(),
              [styles.outgoing]: props.isOutgoing
            }}
            use:ripple={isFooterClickable()}
            onClick={onFooterClick}
          >
            <Transition
              name='fade-2'
              mode='outin'
              onAfterExit={() => {
                setCanFooterBeClickable(willFooterBeClickable());
              }}
            >
              <Switch>
                <Match when={canShowViewResults()}>
                  <I18nTsx key='Chat.Poll.ViewVotes' args={votersCount()?.toString()} />
                </Match>
                <Match when={hasSelectedSomething()}>
                  <I18nTsx key='Chat.Poll.SubmitVote' />
                </Match>
                <Match when={hasTypedNewOption() && !isShowingResult()}>
                  <I18nTsx key='Save' />
                </Match>
                <Match when={isShowingResult()}>
                  <PollVotes
                    votersCount={votersCount()}
                    closed={closed()}
                    hasCorrectAnswer={hasCorrectAnswer()}
                    showWhoVoted={showWhoVoted()}
                  />
                </Match>
                <Match when>
                  <I18nTsx key='Chat.Poll.SelectAnOption' />
                </Match>
              </Switch>
            </Transition>
          </div>
        </div>

        <Show when={canShowCloseTimer()}>
          <div class={styles.timer}>
            <RemainingTime finishTimestamp={closesAtTimestamp()}>
              {(time) => <I18nTsx key='Chat.Poll.EndsIn' args={[time()]} />}
            </RemainingTime>
          </div>
        </Show>

        <Space amount='1rem' />
      </PollMessageContentPropsContext.Provider>
    );
  };
