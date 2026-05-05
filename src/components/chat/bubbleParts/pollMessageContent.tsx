import {ButtonIconTsx} from '@components/buttonIconTsx';
import {IconTsx} from '@components/iconTsx';
import InputField from '@components/inputField';
import {EmojiDropdownButton} from '@components/popups/createPoll/emojiDropdownButton';
import {MediaAttachment} from '@components/popups/createPoll/mediaAttachment';
import ripple from '@components/ripple';
import {HeightTransition} from '@components/sidebarRight/tabs/adminRecentActions/heightTransition';
import Space from '@components/space';
import {StaticCheckbox} from '@components/staticCheckbox';
import StaticRadio from '@components/staticRadio';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import {keepMe} from '@helpers/keepMe';
import formatNumber from '@helpers/number/formatNumber';
import {attachHotClassName} from '@helpers/solid/classname';
import createMiddleware from '@helpers/solid/createMiddleware';
import {I18nTsx} from '@helpers/solid/i18n';
import {requestRAF} from '@helpers/solid/requestRAF';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import classNames from '@helpers/string/classNames';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import {Message, MessageEntity, Poll, PollResults, TextWithEntities} from '@layer';
import getPeerId from '@lib/appManagers/utils/peers/getPeerId';
import {LangPackKey} from '@lib/langPack';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import defineSolidElement, {PassedProps} from '@lib/solidjs/defineSolidElement';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {batch, createEffect, createMemo, createSelector, createSignal, For, JSX, Match, onCleanup, onMount, Show, Switch} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {Transition} from 'solid-transition-group';
import styles from './pollMessageContent.module.scss';

keepMe(ripple);

if(import.meta.hot) import.meta.hot.accept();


type PollOptionResult = {
  voters: number;
  percent: number;
  peerIds: PeerId[];
  chosen: boolean;
};

type LocalTextWithEntities = Pick<TextWithEntities, 'text' | 'entities'>;

const PollOption = (props: {
  withImage?: boolean;
  clickable?: boolean;
  text: LocalTextWithEntities;
  checked: boolean;
  onToggle: () => void;
  isCheckbox: boolean;

  result?: PollOptionResult;
}) => {
  const [fillWidth, setFillWidth] = createSignal(0);

  const isShowingResult = () => !!props.result;

  const middleware = createMiddleware().get();

  createEffect(() => {
    if(!isShowingResult()) return;
    requestRAF(() => {
      setFillWidth((props.result.percent || 0.01) / 100);
    });
    onCleanup(() => {
      setFillWidth(0);
    });
  });

  return (
    <div class={styles.pollOption} classList={{[styles.hasImage]: props.withImage}}>
      <Show when={!isShowingResult()}>
        <div class={styles.clickableArea} use:ripple onClick={props.onToggle} />
      </Show>
      <div class={styles.checkContainer}>
        <Transition name='fade-2'>
          <Show when={!isShowingResult()}>
            <Show
              when={props.isCheckbox}
              fallback={<StaticRadio class={styles.checkbox} checked={props.checked} />}
            >
              <StaticCheckbox class={styles.checkbox} checked={props.checked} />
            </Show>
          </Show>
          <Show when={isShowingResult()}>
            <div class={styles.percent}>
              {props.result.percent || 0}%
            </div>
          </Show>
        </Transition>
      </div>
      <div class={styles.labelRow}>
        <div class={styles.labelText}>
          <AutoHeight>
            {wrapRichText(props.text.text, {entities: props.text.entities, middleware})}
          </AutoHeight>
        </div>
        <Show when={isShowingResult()}>
          <div class={styles.labelStats}>
            <div class={styles.labelNumber}>
              {formatNumber(props.result.voters, 1)}
            </div>
            <Show when={props.result.peerIds?.length > 0}>
              <AvatarGroup peerIds={props.result.peerIds} />
            </Show>
          </div>
        </Show>

        <Transition name='fade-2'>
          <Show when={isShowingResult()}>
            <PollProgressLine progress={fillWidth()} />
          </Show>
        </Transition>

        <Transition name='fade-2'>
          <Show when={isShowingResult()}>
            <StaticCheckbox round={!props.isCheckbox} class={styles.chosenCheckbox} checked={props.result.chosen} />
          </Show>
        </Transition>
      </div>
      <Show when={props.withImage}>
        <div class={classNames(styles.optionImage, styles.red)}></div>
      </Show>
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

const AvatarGroup = (props: {
  peerIds: PeerId[];
}) => {
  const {AvatarNewTsx} = useHotReloadGuard();

  return (
    <div class={styles.avatarGroup}>
      <For each={props.peerIds}>
        {(peerId, index) => (
          <div class={styles.avatarGroupItem} classList={{[styles.pushOverNext]: index() > 0}}>
            <div class={styles.avatarGroupItemWrapper}>
              <AvatarNewTsx class={styles.avatarGroupItemAvatar} size={24} peerId={peerId} />
            </div>
          </div>
        )}
      </For>
    </div>
  );
};


const AutoHeight = (props: {
  children: JSX.Element;
  duration?: number;
  easing?: string;
}) => {
  let containerRef!: HTMLDivElement;
  let contentRef!: HTMLDivElement;

  const [canHaveHeight, setCanHaveHeight] = createSignal(false);
  const [height, setHeight] = createSignal(0);

  onMount(() => {
    const observer = new ResizeObserver(() => {
      batch(() => {
        setCanHaveHeight(true);
        setHeight(contentRef.offsetHeight);
      });
    });

    observer.observe(contentRef);

    onCleanup(() => observer.disconnect());
  });

  return (
    <div
      ref={containerRef}
      style={{
        height: canHaveHeight() ? `${height()}px` : 'auto',
        overflow: 'hidden',
        transition: canHaveHeight() ? `height ${props.duration ?? 300}ms ${props.easing ?? 'ease'}` : 'none'
      }}
    >
      <div ref={contentRef}>{props.children}</div>
    </div>
  );
};

const AddOption = (props: {
  inputFieldRef: (value: InputField) => void;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  onInput: (text: LocalTextWithEntities) => void;
}) => {
  const [attachment, setAttachment] = createSignal('');

  const visible = () => props.visible;

  const inputField = new InputField({
    placeholder: 'NewPoll.Option',
    canWrapCustomEmojis: true,
    onRawInput: () => {
      const {value, entities} = getRichValueWithCaret(inputField.input, true, false);
      props.onInput({text: value, entities});
    }
  });

  const onAfterEnter = () => {
    if(visible()) {
      inputField.input.focus();
    }
  };

  props.inputFieldRef(inputField);

  inputField.placeholder.classList.add(styles.inputFieldPlaceholder);

  return (
    <div class={classNames(styles.pollOption, styles.hasImage)}>
      <Show when={!visible()}>
        <div class={styles.clickableArea} use:ripple={!visible()} onClick={() => props.onVisibleChange(!visible())} />
      </Show>

      <div class={styles.checkContainer}>
        <Transition name='fade'>
          <Show when={!visible()}>
            <IconTsx icon='add' class={styles.addOptionPlus} />
          </Show>
          <Show when={visible()}>
            <EmojiDropdownButton class={styles.emojiDropdownButton} inputField={inputField} />
          </Show>
        </Transition>
      </div>
      <div class={styles.labelRow}>
        <div class={styles.labelText}>
          <Transition name='fade' mode='outin' onAfterEnter={onAfterEnter}>
            <Show when={visible()} fallback={<I18nTsx key='Chat.Poll.AddAnOption' />}>
              <div class={styles.inputFieldInternals}>
                {inputField.input}
                {inputField.placeholder}
              </div>
            </Show>
          </Transition>
        </div>
      </div>
      <div class={styles.optionImage}>
        <Show when={visible()}>
          <MediaAttachment
            btnClass={styles.optionImageBtn}
            imgClass={styles.optionImageImg}
            objectUrl={attachment()}
            onChange={setAttachment}
          />
        </Show>
      </div>
    </div>
  );
};

const Explanation = () => {
  return (
    <div class='reply quote-like quote-like-border'>
      <div class='reply-content'>
        <div class='reply-title'>
          <I18nTsx key='Chat.Quiz.Explanation' />
        </div>
        <div class='reply-subtitle'>
            Some explanation text here
        </div>
        <Space amount='0.5rem' />
        <div class={styles.explanationImage}>
        </div>
      </div>
    </div>
  );
};


type CommonProps = {
  closed?: boolean;
  hasCorrectAnswer?: boolean;
  showWhoVoted?: boolean;
};

const PollType = (props: CommonProps) => {
  const key = createMemo((): LangPackKey => {
    if(props.closed) return 'Chat.Poll.Type.Closed';
    if(props.hasCorrectAnswer) return props.showWhoVoted ? 'Chat.Poll.Type.Quiz' : 'Chat.Poll.Type.AnonymousQuiz';
    return props.showWhoVoted ? 'Chat.Poll.Type.Public' : 'Chat.Poll.Type.Anonymous';
  });

  return (
    <I18nTsx key={key()} />
  );
};

const PollVotes = (props: CommonProps & { votersCount: number }) => {
  const key = createMemo((): LangPackKey => {
    if(props.closed) {
      if(props.hasCorrectAnswer) return props.votersCount ? 'Chat.Quiz.TotalVotes' : 'Chat.Poll.TotalVotesResultEmpty';
      else return props.votersCount ? 'Chat.Poll.TotalVotes1' : 'Chat.Poll.TotalVotesResultEmpty';
    } else {
      if(props.hasCorrectAnswer) return props.votersCount ? 'Chat.Quiz.TotalVotes' : 'Chat.Quiz.TotalVotesEmpty';
      else return props.votersCount ? 'Chat.Poll.TotalVotes1' : 'Chat.Poll.TotalVotesEmpty';
    }
  });

  return (
    <I18nTsx key={key()} args={[props.votersCount.toString()]} />
  );
};


export type PollMessageContentProps = {
  poll: Poll;
  message: Message.message;
  results: PollResults;
};

export const PollMessageContent = defineSolidElement({
  name: 'poll-message-content',
  component: (props: PassedProps<PollMessageContentProps>) => {
    attachHotClassName(props.element, styles.container);

    const {rootScope} = useHotReloadGuard();

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

    const resultForOption = (index: number): PollOptionResult => isShowingResult() ? ({
      chosen: props.results?.results?.[index]?.pFlags?.chosen ?? false,
      percent: roundedPercents()[index],
      voters: props.results?.results?.[index]?.voters ?? 0,
      peerIds: props.results?.results?.[index]?.recent_voters?.map(peer => getPeerId(peer)) ?? []
    }) : undefined;

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
        <div class={styles.pollImageWrapper}>
          <div class={styles.pollImage} />
        </div>
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

          <Show when={false}>
            <ButtonIconTsx icon='lamp' onClick={() => setExplanationToggled(p => !p)} />
          </Show>
        </div>

        <HeightTransition scale>
          <Show when={explanationToggled()}>
            <div style={{overflow: 'hidden'}}>
              <Explanation />
            </div>
          </Show>
        </HeightTransition>

        <For each={pollOptions()}>
          {(option, index) => (
            <PollOption
              text={option.text}
              withImage={withImage}
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
      </>
    );
  }
});

function roundPercents(percents: number[]): number[] {
  const base = percents.map(Math.floor);

  const remainders = percents.map((p, i) => ({
    index: i,
    remainder: p - base[i]
  }));

  const sum = base.reduce((a, b) => a + b, 0);
  const diff = 100 - sum;

  remainders.sort((a, b) => b.remainder - a.remainder);

  const mxI = Math.min(diff, remainders.length);

  for(let i = 0; i < mxI; i++) {
    base[remainders[i].index]++;
  }

  return base;
};
