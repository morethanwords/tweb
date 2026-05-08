import {ButtonIconTsx} from '@components/buttonIconTsx';
import InputField from '@components/inputField';
import ripple from '@components/ripple';
import {HeightTransition} from '@components/sidebarRight/tabs/adminRecentActions/heightTransition';
import Space from '@components/space';
import PhotoTsx from '@components/wrappers/photoTsx';
import {keepMe} from '@helpers/keepMe';
import createMiddleware from '@helpers/solid/createMiddleware';
import {I18nTsx} from '@helpers/solid/i18n';
import {attachHotClassName} from '@helpers/solid/classname';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import {InputMedia, Message, MessageEntity, MessageMedia, Photo, Poll, PollResults} from '@layer';
import getPeerId from '@lib/appManagers/utils/peers/getPeerId';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import defineSolidElement, {PassedProps} from '@lib/solidjs/defineSolidElement';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {batch, createMemo, createSelector, createSignal, For, Match, Show, Switch} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {Transition} from 'solid-transition-group';
import {AddOption} from './AddOption';
import {AvatarGroup, Explanation, PollType, PollVotes} from './parts';
import {PollOption} from './PollOption';
import styles from './styles.module.scss';
import {PollOptionResult, roundPercents} from './utils';

keepMe(ripple);

export type PollMessageContentProps = {
  poll: Poll;
  message: Message.message;
  results: PollResults;
  media: MessageMedia.messageMediaPoll;
};

export const PollMessageContent = defineSolidElement({
  name: 'poll-message-content',
  component: (props: PassedProps<PollMessageContentProps>) => {
    attachHotClassName(props.element, styles.container);

    const {rootScope, wrapPhoto} = useHotReloadGuard();

    const middleware = createMiddleware().get();

    const [explanationToggled, setExplanationToggled] = createSignal(false);
    const [chosenIndexes, setChosenIndexes] = createSignal<number[]>([]);
    const [isFooterClickable, setIsFooterClickable] = createSignal(false);
    const [isAddingNewOptionVisible, setIsAddingNewOptionVisible] = createSignal(false);
    const [newOptionText, setNewOptionText] = createSignal<{ text: string, entities: MessageEntity[] }>({
      text: '',
      entities: []
    });

    const withImage = true;
    let inputField: InputField;

    const hasSelectedSomething = createMemo(() => chosenIndexes().length > 0);
    const isChecked = createSelector(chosenIndexes, (index: number, indices) => indices.includes(index));
    const isShowingResult = createMemo(() => !!props.poll.chosenIndexes?.length || props.poll.pFlags.closed);
    const hasTypedNewOption = createMemo(() => newOptionText().text.length > 0);
    const willFooterBeClickable = createMemo(() => hasSelectedSomething() || hasTypedNewOption());

    const flag = (value: any) => !!value;

    const question = () => props.poll.question.text;
    const questionEntities = () => props.poll.question.entities;
    const description = () => props.message.message;
    const descriptionEntities = () => props.message.entities;
    const pollOptions = createMemo(() => props.poll.answers.filter(answer => answer._ === 'pollAnswer'));
    const allowAddingOptions = createMemo(() => flag(props.poll.pFlags.open_answers));
    const allowMultipleAnswers = createMemo(() => flag(props.poll.pFlags.multiple_choice));
    const hasCorrectAnswer = createMemo(() => flag(props.poll.pFlags.quiz));
    const shuffleOptions = createMemo(() => flag(props.poll.pFlags.shuffle_answers));
    const showWhoVoted = createMemo(() => flag(props.poll.pFlags.public_voters));
    const closed = createMemo(() => flag(props.poll.pFlags.closed));
    const hideResults = createMemo(() => flag(props.poll.pFlags.hide_results_until_close));

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

    const getPhoto = (media: MessageMedia | InputMedia | undefined): Photo.photo | undefined => {
      return media?._ === 'messageMediaPhoto' && media.photo?._ === 'photo' ? unwrap(media.photo) : undefined;
    };

    const explanationPhoto = createMemo(() => getPhoto(props.results.solution_media));
    const descriptionPhoto = createMemo(() => getPhoto(props.media.attached_media));

    const resultForOption = (index: number): PollOptionResult => isShowingResult() ? ({
      chosen: props.results?.results?.[index]?.pFlags?.chosen ?? false,
      percent: roundedPercents()[index],
      voters: props.results?.results?.[index]?.voters ?? 0,
      peerIds: props.results?.results?.[index]?.recent_voters?.map(peer => getPeerId(peer)) ?? []
    }) : undefined;

    const photoForOption = (index: number): Photo.photo | undefined => getPhoto(props.poll.answers[index]?.media);

    subscribeOn(rootScope)('poll_update', ({poll, results}) => {
      if(poll.id !== props.poll.id) return;

      props.poll = poll;
      props.results = results;
    });

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

    const sendVote = async() => {
      if(isShowingResult() || !hasSelectedSomething()) return;

      await rootScope.managers.appPollsManager.sendVote(unwrap(props.message), chosenIndexes());

      setChosenIndexes([]);
    };

    const addOption = async() => {
      const {text, entities} = newOptionText();
      if(isShowingResult() || !text) return;

      await rootScope.managers.appPollsManager.addPollAnswer(
        unwrap(props.message),
        {
          _: 'textWithEntities',
          text,
          entities
        }
      );

      batch(() => {
        setIsAddingNewOptionVisible(false);
        setNewOptionText({text: '', entities: []});
      });
      inputField.setValueSilently('');
    };

    const onFooterClick = wrapAsyncClickHandler(async() => {
      if(hasSelectedSomething()) await sendVote();
      if(hasTypedNewOption()) await addOption();
    });

    return (
      <>
        <Show when={descriptionPhoto()}>
          <div class={styles.pollImageWrapper}>
            <div class={styles.pollImage}>
              <PhotoTsx photo={descriptionPhoto()} />
            </div>
          </div>
        </Show>
        <Show when={description()}>
          <div class={styles.description}>
            {wrapRichText(description(), {entities: descriptionEntities(), middleware})}
          </div>
        </Show>
        <div class={styles.header}>
          <div class={styles.headerTitleContainer}>
            <div class={styles.headerTitle}>
              {wrapRichText(question(), {entities: questionEntities(), middleware})}
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
              <Explanation text={props.results?.solution} entities={props.results?.solution_entities} photo={explanationPhoto()} />
            </div>
          </Show>
        </HeightTransition>

        <For each={pollOptions()}>
          {(option, index) => (
            <PollOption
              text={option.text}
              withImage={hasPhotoInOptions()}
              photo={photoForOption(index())}
              isCheckbox={allowMultipleAnswers()}

              checked={isChecked(index())}
              onToggle={() => handleToggle(index())}

              result={resultForOption(index())}
            />
          )}
        </For>

        <HeightTransition>
          <Show when={allowAddingOptions() && !isShowingResult()}>
            <div style={{overflow: 'hidden'}}>
              <AddOption
                inputFieldRef={(value: InputField) => void (inputField = value)}
                onInput={setNewOptionText}
                visible={isAddingNewOptionVisible()}
                onVisibleChange={setIsAddingNewOptionVisible}
              />
            </div>
          </Show>
        </HeightTransition>

        <div
          class={styles.footer}
          classList={{[styles.clickable]: isFooterClickable()}}
          use:ripple={isFooterClickable()}
          onClick={onFooterClick}
        >
          <Transition
            name='fade-2'
            mode='outin'
            onAfterExit={() => {
              setIsFooterClickable(willFooterBeClickable());
            }}
          >
            <Switch>
              <Match when={hasSelectedSomething()}>
                <I18nTsx key='Chat.Poll.SubmitVote' />
              </Match>
              <Match when={hasTypedNewOption()}>
                <I18nTsx key='Save' />
              </Match>
              <Match when>
                <PollVotes
                  votersCount={votersCount()}
                  closed={closed()}
                  hasCorrectAnswer={hasCorrectAnswer()}
                  showWhoVoted={showWhoVoted()}
                />
              </Match>
            </Switch>
          </Transition>
        </div>

        {/* some space for the time span */}
        <Space amount='0.75rem' />
      </>
    );
  }
});
