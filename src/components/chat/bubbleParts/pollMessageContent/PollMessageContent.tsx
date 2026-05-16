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
import compareUint8Arrays from '@helpers/bytes/compareUint8Arrays';
import {setCaretAtEnd} from '@helpers/dom/setCaretAt';
import {keepMe} from '@helpers/keepMe';
import {attachHotClassName} from '@helpers/solid/classname';
import {createDelayed} from '@helpers/solid/createDelayed';
import createMiddleware from '@helpers/solid/createMiddleware';
import {createMutation} from '@helpers/solid/createMutation';
import {HeightTransition} from '@helpers/solid/heightTransition';
import {I18nTsx} from '@helpers/solid/i18n';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import type {ChatAutoDownloadSettings} from '@hooks/useAutoDownloadSettings';
import {InputMedia, Message, MessageMedia, Photo, Poll, PollAnswer, PollResults} from '@layer';
import getPeerId from '@lib/appManagers/utils/peers/getPeerId';
import {sliceTextWithEntities} from '@lib/richTextProcessor/sliceTextWithEntities';
import wrapDraftText from '@lib/richTextProcessor/wrapDraftText';
import defineSolidElement, {PassedProps} from '@lib/solidjs/defineSolidElement';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {batch, createComputed, createEffect, createMemo, createResource, createSelector, createSignal, For, Match, Show, Switch, untrack} from 'solid-js';
import {createStore, reconcile, unwrap} from 'solid-js/store';
import {Transition, TransitionGroup} from 'solid-transition-group';
import {AddOption} from './AddOption';
import {PollMessageContentPropsContext} from './context';
import {AvatarGroup, Explanation, PollType, PollVotes} from './parts';
import {PollOption} from './PollOption';
import {shouldShufflePollOptions, shufflePollOptions} from './shuffle';
import styles from './styles.module.scss';
import {attachSpoilerOverlay, dataPollViewerIdx, NewOptionValues, PollOptionResult, roundPercents} from './utils';


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

    const {rootScope, useAppSettings, AppMediaViewerStatic, appSidebarRight, AppPollResultsTab, TranslatableMessageTsx} = useHotReloadGuard();
    const [appSettings] = useAppSettings();

    const middleware = createMiddleware().get();

    const {maxOptions, maxOptionLength} = useCreatePollLimits();

    const [explanationToggled, setExplanationToggled] = createSignal(false);
    const [chosenIndexes, setChosenIndexes] = createSignal<number[]>([]);
    const [canFooterBeClickable, setCanFooterBeClickable] = createSignal(false);
    const [isAddingNewOptionVisible, setIsAddingNewOptionVisible] = createSignal(false);
    const [newOption, setNewOption] = createStore<NewOptionValues>({
      text: '',
      entities: []
    });
    const [descriptionElement, setDescriptionElement] = createSignal<HTMLDivElement>();

    const [timeOffset] = createResource(() => rootScope.managers.timeManager.getServerTimeOffset());

    let inputField: InputField;

    const question = () => props.poll.question;
    const descriptionText = () => props.message.message;
    const descriptionEntities = () => props.message.entities;
    const allowAddingOptions = createMemo(() => !!props.poll.pFlags.open_answers);
    const allowMultipleAnswers = createMemo(() => !!props.poll.pFlags.multiple_choice);
    const hasCorrectAnswer = createMemo(() => !!props.poll.pFlags.quiz);
    const shuffleOptions = createMemo(() => shouldShufflePollOptions(props.poll));
    const showWhoVoted = createMemo(() => !!props.poll.pFlags.public_voters);
    const closed = createMemo(() => !!props.poll.pFlags.closed);
    const closesAtTimestamp = createMemo(() => timeOffset.state === 'ready' ? props.poll.close_date - timeOffset() : 0);
    // const hideResults = createMemo(() => !!props.poll.pFlags.hide_results_until_close);

    const votersCount = createMemo(() => props.results?.total_voters ?? 0);
    const recentVoters = createMemo(() => props.results?.recent_voters?.map(peer => getPeerId(peer)) ?? []);

    const roundedPercents = createMemo(() => {
      const results = props.results?.results;
      if(!results) return [];

      const totalVotes = results.reduce((acc, r) => acc + (r.voters ?? 0), 0);
      if(!totalVotes) return new Array(results.length).fill(0);

      return roundPercents(results.map(r => totalVotes ? (r.voters ?? 0) / totalVotes * 100 : 0));
    });

    const hasPhotoInOptions = createMemo(() => props.poll.answers.some(a => a.media?._ === 'messageMediaPhoto' && a.media.photo?._ === 'photo'));

    const hasExplanation = createMemo(() => {
      return !!props.results.solution || !!props.results.solution_media;
    });

    let initialOptions = props.poll.answers.filter(answer => answer._ === 'pollAnswer');

    if(shuffleOptions()) initialOptions = shufflePollOptions({
      initialOptions,
      seed: appSettings.userRandomSeed,
      mid: props.message.mid,
      peerId: props.message.peerId
    });

    const [pollOptions, setPollOptions] = createStore<PollAnswer.pollAnswer[]>(initialOptions);

    createComputed(() => {
      const filteredOptions = props.poll.answers.filter(answer => answer._ === 'pollAnswer');

      // Keep the order after intial shuffle and append new options at the end when the poll was already rendered
      filteredOptions.forEach((option) => {
        const idx = untrack(() => pollOptions.findIndex(other => compareUint8Arrays(other.option, option.option)));
        if(idx === -1) setPollOptions(untrack(() => pollOptions.length), option);
        else setPollOptions(idx, reconcile(option));
      });

      // Remove options that are no longer in the poll
      setPollOptions(prev =>
        prev.filter(option => filteredOptions.some(other => compareUint8Arrays(option.option, other.option)))
      );
    });

    const hasSelectedSomething = createMemo(() => chosenIndexes().length > 0);
    const isChecked = createSelector(chosenIndexes, (index: number, indices) => indices.includes(index));
    const isShowingResult = createMemo(() => !!props.poll.chosenIndexes?.length || props.poll.pFlags.closed);
    const hasTypedNewOption = createMemo(() => newOption.text.length > 0);
    const canShowAddOption = createMemo(() => allowAddingOptions() && !isShowingResult() && pollOptions.length < maxOptions());
    const canShowCloseTimer = createMemo(() => !props.poll.pFlags.closed && !!closesAtTimestamp() && closesAtTimestamp() > new Date().getTime() / 1000);
    const canShowViewResults = createMemo(() => showWhoVoted() && !!props.results.total_voters && isShowingResult());

    // The footer will have the clickable classname added/removed only after the out animation has finished
    const willFooterBeClickable = createMemo(() => canShowViewResults() || hasSelectedSomething() || hasTypedNewOption());

    setCanFooterBeClickable(willFooterBeClickable());

    const getOverridenMessage = (): Message.message => ({
      ...unwrap(props.message),
      media: {
        _: 'messageMediaPoll',
        ...unwrap(props.media),
        // On poll_update, only the poll and results are updated, not the message itself
        poll: unwrap(props.poll),
        results: unwrap(props.results)
      }
    });

    const getPhoto = (media: MessageMedia | InputMedia | undefined): Photo.photo | undefined => {
      return media?._ === 'messageMediaPhoto' && media.photo?._ === 'photo' ? unwrap(media.photo) : undefined;
    };

    const explanationPhoto = createMemo(() => getPhoto(props.results.solution_media));
    const descriptionPhoto = createMemo(() => getPhoto(props.media.attached_media));

    const initialIdxFromShuffledIdx = (idx: number) => {
      const shuffledOption = pollOptions[idx]?.option;

      return props.poll.answers.findIndex(
        other => other._ === 'pollAnswer' &&
          other.option &&
          shuffledOption &&
          compareUint8Arrays(other.option, shuffledOption)
      )
    };

    const getResultForOption = (initialIdx: number): PollOptionResult => {
      if(!isShowingResult()) return undefined;
      const result = props.results?.results?.[initialIdx];
      return {
        correct: props.poll.correctIndexes?.includes(initialIdx) ?? false,
        chosen: props.poll.chosenIndexes?.includes(initialIdx) ?? false,
        percent: roundedPercents()[initialIdx],
        voters: result?.voters ?? 0,
        peerIds: result?.recent_voters?.map(peer => getPeerId(peer)) ?? []
      };
    };

    const getPhotoForOption = (initialIdx: number): Photo.photo | undefined => getPhoto(props.poll.answers[initialIdx]?.media);

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

    const resetInteractiveState = () => batch(() => {
      setChosenIndexes([]);
      setIsAddingNewOptionVisible(false);
      setNewOption(reconcile({text: '', entities: []}));
      inputField?.setValueSilently('');
    });

    const sendVoteMutation = createMutation(async() => {
      if(isShowingResult() || !hasSelectedSomething()) return;

      const optionIndexes = chosenIndexes().map(initialIdxFromShuffledIdx).filter(idx => idx !== -1);

      await rootScope.managers.appPollsManager.sendVote(getOverridenMessage(), optionIndexes);

      resetInteractiveState();
    });

    // In case the vote is sent immediately, we delay the pending state to avoid showing the spinner too soon
    const delayedSendVotePending = createDelayed(sendVoteMutation.isPending, false, value => value ? 100 : -1);

    const addOptionMutation = createMutation(async() => {
      const {text, entities, attachment} = unwrap(newOption);
      if(isShowingResult() || !text) return;

      await rootScope.managers.appPollsManager.addPollAnswer(
        getOverridenMessage(),
        {
          _: 'textWithEntities',
          text,
          entities
        },
        attachment
      );

      resetInteractiveState();
    });

    const wrappedAddOption = wrapAsyncClickHandler(addOptionMutation.mutateAsync);

    // Make the footer unclickable immediately when there are pending requests
    const isFooterClickable = createMemo(() => canFooterBeClickable() && !sendVoteMutation.isPending() && !addOptionMutation.isPending());

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

    subscribeOn(rootScope)('poll_update', ({poll, results}) => {
      if(poll.id !== props.poll.id) return;

      props.poll = poll;
      props.results = results;
    });

    createEffect(() => {
      if(!descriptionElement()) return;
      attachSpoilerOverlay(descriptionElement(), props);
    });

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
        if(getPhoto(option.media)) {
          photos.push(getPhoto(option.media));
          indexes.options.set(idx, idxSeed++);
        }
      });

      return {photos, indexes};
    });

    const elementByIndexMap = new Map<number, HTMLElement>();

    controls.openMediaViewer = (idx: number) => {
      const getTarget = (idx: number): AppMediaViewerStaticTargetType => ({
        media: mediaViewerPayload().photos[idx],
        element: elementByIndexMap.get(idx),
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
                visible={isAddingNewOptionVisible()}
                onVisibleChange={setIsAddingNewOptionVisible}
                isPending={addOptionMutation.isPending()}
              />
            </div>
          </Show>
        </HeightTransition>

        <div
          class={styles.footer}
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

        {/* some space for the time span */}
        <Space amount='0.75rem' />
      </PollMessageContentPropsContext.Provider>
    );
  }
});
