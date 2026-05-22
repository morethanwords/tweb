import {AnimationItemGroup} from '@components/animationIntersector';
import {AppMediaViewerStaticTargetType} from '@components/appMediaViewerStatic';
import {AutoHeight} from '@components/autoHeight';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import InputField from '@components/inputField';
import type LazyLoadQueue from '@components/lazyLoadQueue';
import {useCreatePollLimits} from '@components/popups/createPoll/useCreatePollLimits';
import {RemainingTime} from '@components/remainingTime';
import ripple from '@components/ripple';
import Space from '@components/space';
import PhotoTsx from '@components/wrappers/photoTsx';
import {setCaretAtEnd} from '@helpers/dom/setCaretAt';
import {keepMe} from '@helpers/keepMe';
import {attachHotClassName} from '@helpers/solid/classname';
import createMiddleware from '@helpers/solid/createMiddleware';
import {HeightTransition} from '@helpers/solid/heightTransition';
import {I18nTsx} from '@helpers/solid/i18n';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import type {ChatAutoDownloadSettings} from '@hooks/useAutoDownloadSettings';
import {Message, MessageMedia, Photo, Poll, PollResults} from '@layer';
import {sliceTextWithEntities} from '@lib/richTextProcessor/sliceTextWithEntities';
import wrapDraftText from '@lib/richTextProcessor/wrapDraftText';
import defineSolidElement, {PassedProps} from '@lib/solidjs/defineSolidElement';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {batch, createEffect, createMemo, createSelector, createSignal, For, Match, Show, Switch} from 'solid-js';
import {createStore, reconcile, unwrap} from 'solid-js/store';
import {Transition, TransitionGroup} from 'solid-transition-group';
import {AddOption} from './AddOption';
import {PollMessageContentPropsContext} from './context';
import {AvatarGroup, Explanation, PollType, PollVotes} from './parts';
import {PollOption} from './PollOption';
import styles from './styles.module.scss';
import {usePollDerivedProps} from './usePollDerivedProps';
import {usePollMutations} from './usePollMutations';
import {usePollOptionsStore} from './usePollOptionsStore';
import {attachSpoilerOverlay, dataPollViewerIdx, NewOptionValues} from './utils';


keepMe(ripple);
keepMe(dataPollViewerIdx);

export type PollMessageContentProps = {
  isOutgoing?: boolean;
  poll: Poll;
  peerId: PeerId;
  message: Message.message;
  results: PollResults;
  media: MessageMedia.messageMediaPoll;
  autoDownload?: ChatAutoDownloadSettings;
  lazyLoadQueue?: false | LazyLoadQueue;
  animationGroup?: AnimationItemGroup;
  loadPromises: Promise<any>[];
};

type Controls = {
  openMediaViewer: (idx: number) => void;
};

type MediaViewerPayloadIndexes = {
  description?: number;
  explanation?: number;
  options: Map<number, number>;
};

export const PollMessageContent = defineSolidElement({
  name: 'poll-message-content',
  component: (props: PassedProps<PollMessageContentProps>, _, controls: Controls) => {
    attachHotClassName(props.element, styles.container);

    // ----- Setup / external dependencies -----
    const {rootScope, useAppSettings, AppMediaViewerStatic, appSidebarRight, AppPollResultsTab, TranslatableMessageTsx} = useHotReloadGuard();
    const [appSettings] = useAppSettings();
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
      hasPhotoInOptions,
      hasExplanation,
      hasSelectedSomething,
      isShowingResult,
      hasTypedNewOption,
      canShowAddOption,
      canShowCloseTimer,
      canShowViewResults,
      willFooterBeClickable,
      explanationPhoto,
      descriptionPhoto,
      getOverridenMessage,
      initialIdxFromShuffledIdx,
      getResultForOption,
      getPhotoForOption
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
      delayedSendVotePending,
      addOptionMutation,
      wrappedAddOption
    } = usePollMutations({
      getOverridenMessage,
      isShowingResult,
      hasSelectedSomething,
      chosenIndexes,
      initialIdxFromShuffledIdx,
      newOption,
      onSuccess: resetInteractiveState
    });

    // Make the footer unclickable immediately when there are pending requests
    const isFooterClickable = createMemo(() => canFooterBeClickable() && !sendVoteMutation.isPending() && !addOptionMutation.isPending());

    // ----- Media viewer payload -----
    const mediaViewerPayload = createMemo(() => {
      let idxSeed = 0;

      const photos: Photo.photo[] = [];
      const indexes: MediaViewerPayloadIndexes = {
        options: new Map()
      };

      if(descriptionPhoto()) {
        photos.push(descriptionPhoto());
        indexes.description = idxSeed++;
      }

      if(explanationPhoto()) {
        photos.push(explanationPhoto());
        indexes.explanation = idxSeed++;
      }

      props.poll.answers.forEach((option, idx) => {
        const photo = getPhotoForOption(idx);
        if(photo) {
          photos.push(photo);
          indexes.options.set(idx, idxSeed++);
        }
      });

      return {photos, indexes};
    });

    // ----- Event handlers -----
    const handleToggle = (index: number) => {
      setChosenIndexes(prev => {
        if(!allowMultipleAnswers()) {
          return prev.includes(index) ? [] : [index];
        } else if(prev.includes(index)) {
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
      else if(hasSelectedSomething()) await sendVoteMutation.mutateAsync();
      else if(hasTypedNewOption()) await wrappedAddOption();
    });

    // ----- Effects & subscriptions -----
    subscribeOn(rootScope)('poll_update', ({poll, results}) => {
      if(poll.id !== props.poll.id) return;

      props.poll = poll;
      props.results = results;
    });

    createEffect(() => {
      if(!descriptionElement()) return;
      attachSpoilerOverlay(descriptionElement(), props);
    });

    // ----- Imperative controls -----
    controls.openMediaViewer = (idx: number) => {
      const getTarget = (idx: number): AppMediaViewerStaticTargetType => ({
        media: mediaViewerPayload().photos[idx],
        element: elementByIndexMap.get(idx)?.querySelector('.media-photo'),
        fromId: props.message.fromId,
        timestamp: props.message.date,
        peerId: props.message.peerId
      });

      new AppMediaViewerStatic().openMedia({
        allTargets: mediaViewerPayload().photos.map((_, idx) => getTarget(idx)),
        index: idx,
        fromRight: 0,
        ...getTarget(idx)
      });
    };

    return (
      <PollMessageContentPropsContext.Provider value={props}>
        <Show when={descriptionPhoto()}>
          <div class={styles.pollImageWrapper}>
            <div class={styles.pollImage} use:dataPollViewerIdx={[mediaViewerPayload().indexes.description, elementByIndexMap]}>
              <PhotoTsx
                photo={descriptionPhoto()}
                loadPromises={props.loadPromises}
                autoDownloadSize={props.autoDownload?.photo}
                lazyLoadQueue={props.lazyLoadQueue}
              />
            </div>
          </div>
        </Show>
        <Show when={descriptionText()}>
          <div ref={setDescriptionElement} class={styles.description}>
            <TranslatableMessageTsx
              peerId={props.peerId}
              textWithEntities={{_: 'textWithEntities', text: descriptionText(), entities: unwrap(descriptionEntities())}}
              richTextOptions={{middleware: createMiddleware().get(), loadPromises: props.loadPromises}}
            />
          </div>
        </Show>
        <div class={styles.header}>
          <div class={styles.headerTitleContainer}>
            <div class={styles.headerTitle}>
              <TranslatableMessageTsx
                peerId={props.peerId}
                textWithEntities={unwrap(question())}
                richTextOptions={{middleware, loadPromises: props.loadPromises}}
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

        <HeightTransition scale>
          <Show when={explanationToggled()}>
            <div style={{overflow: 'hidden'}}>
              <Explanation
                text={props.results?.solution}
                entities={props.results?.solution_entities}
                photo={explanationPhoto()}
                pollViewerPayload={[mediaViewerPayload().indexes.explanation, elementByIndexMap]}
              />
            </div>
          </Show>
        </HeightTransition>

        <AutoHeight>
          <TransitionGroup name='fade-2' moveClass='t-move'>
            <For each={pollOptions}>
              {(option, index) => {
                const initialIdx = createMemo(() => initialIdxFromShuffledIdx(index()));

                return (
                  <PollOption
                    text={option.text}
                    withImage={hasPhotoInOptions()}
                    photo={getPhotoForOption(initialIdx())}
                    allowMultipleAnswers={allowMultipleAnswers()}
                    hasCorrectAnswer={hasCorrectAnswer()}
                    checked={isChecked(index())}
                    onToggle={() => handleToggle(index())}
                    pollViewerPayload={[mediaViewerPayload().indexes.options.get(initialIdx()), elementByIndexMap]}
                    result={getResultForOption(initialIdx())}
                    isPendingVote={delayedSendVotePending()}
                    hideResults={hideResults()}
                  />
                );
              }}
            </For>
          </TransitionGroup>
        </AutoHeight>

        <HeightTransition>
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
        </HeightTransition>

        <div
          class={styles.footer}
          classList={{
            [styles.clickable]: isFooterClickable(),
            [styles.outgoing]: props.isOutgoing,
            [styles.withTime]: canShowCloseTimer()
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
                <I18nTsx key='Chat.Poll.ViewResults' />
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

        <Show when={canShowCloseTimer()}>
          <div class={styles.timer}>
            <div class={styles.timerContent}>
              <RemainingTime finishTimestamp={closesAtTimestamp()}>
                {(time) => <I18nTsx key='Chat.Poll.EndsIn' args={[time()]} />}
              </RemainingTime>
            </div>
          </div>
        </Show>
      </PollMessageContentPropsContext.Provider>
    );
  }
});
