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
import {keepMe} from '@helpers/keepMe';
import formatNumber from '@helpers/number/formatNumber';
import {attachHotClassName} from '@helpers/solid/classname';
import createMiddleware from '@helpers/solid/createMiddleware';
import {I18nTsx} from '@helpers/solid/i18n';
import {requestRAF} from '@helpers/solid/requestRAF';
import classNames from '@helpers/string/classNames';
import {MessageEntity} from '@layer';
import {LangPackKey} from '@lib/langPack';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import defineSolidElement, {PassedProps} from '@lib/solidjs/defineSolidElement';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {batch, createEffect, createMemo, createSelector, createSignal, For, JSX, onCleanup, onMount, Show} from 'solid-js';
import {Transition} from 'solid-transition-group';
import styles from './pollMessageContent.module.scss';

keepMe(ripple);

if(import.meta.hot) import.meta.hot.accept();


const PollOption = (props: {
  withImage?: boolean;
  clickable?: boolean;
  text: {
    text: string;
    entities: MessageEntity[];
  };
  toggled: boolean;
  checked: boolean;
  onToggle: () => void;
  isCheckbox: boolean;
}) => {
  const [fillWidth, setFillWidth] = createSignal(0);

  const toggled = () => props.toggled;

  const middleware = createMiddleware().get();

  createEffect(() => {
    if(!toggled()) return;
    requestRAF(() => {
      setFillWidth(0.4);
    });
    onCleanup(() => {
      setFillWidth(0);
    });
  });

  return (
    <div class={styles.pollOption} classList={{[styles.hasImage]: props.withImage}}>
      <div class={styles.clickableArea} use:ripple={props.clickable} onClick={props.onToggle} />
      <div class={styles.checkContainer}>
        <Transition name='fade-2'>
          <Show when={!toggled()}>
            <Show
              when={props.isCheckbox}
              fallback={<StaticRadio class={styles.checkbox} checked={props.checked} />}
            >
              <StaticCheckbox class={styles.checkbox} checked={props.checked} />
            </Show>
          </Show>
          <Show when={toggled()}>
            <div class={styles.percent}>
              35%
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
        <Show when={toggled()}>
          <div class={styles.labelStats}>
            <div class={styles.labelNumber}>
              {formatNumber(42550, 0)}
            </div>
            <AvatarGroup />
          </div>
        </Show>

        <Transition name='fade-2'>
          <Show when={toggled()}>
            <PollProgressLine progress={fillWidth()} />
          </Show>
        </Transition>

        <Transition name='fade-2'>
          <Show when={toggled()}>
            <StaticCheckbox round class={styles.chosenCheckbox} checked />
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

const AvatarGroup = (props: {}) => {
  const {AvatarNewTsx} = useHotReloadGuard();

  return (
    <div class={styles.avatarGroup}>
      <div class={styles.avatarGroupItem}>
        <div class={styles.avatarGroupItemWrapper}>
          <AvatarNewTsx class={styles.avatarGroupItemAvatar} size={24} peerId={-2875650078} />
        </div>
      </div>
      <div class={styles.avatarGroupItem} classList={{[styles.pushOverNext]: true}}>
        <div class={styles.avatarGroupItemWrapper}>
          <AvatarNewTsx class={styles.avatarGroupItemAvatar} size={24} peerId={-1006503122} />
        </div>
      </div>
      <div class={styles.avatarGroupItem} classList={{[styles.pushOverNext]: true}}>
        <div class={styles.avatarGroupItemWrapper}>
          <AvatarNewTsx class={styles.avatarGroupItemAvatar} size={24} peerId={-1307778786} />
        </div>
      </div>
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

const AddOption = (props: {}) => {
  const { } = useHotReloadGuard();
  const [toggled, setToggled] = createSignal(false);
  const [attachment, setAttachment] = createSignal('');

  const inputField = new InputField({
    placeholder: 'NewPoll.Option',
    canWrapCustomEmojis: true,
    onRawInput: () => {

    }
  });

  const onAfterEnter = () => {
    if(toggled()) {
      inputField.input.focus();
    }
  };

  inputField.placeholder.classList.add(styles.inputFieldPlaceholder);

  return (
    <div class={classNames(styles.pollOption, styles.withImage)}>
      <Show when={!toggled()}>
        <div class={styles.clickableArea} use:ripple={!toggled()} onClick={() => setToggled(!toggled())} />
      </Show>

      <div class={styles.checkContainer}>
        <Transition name='fade'>
          <Show when={!toggled()}>
            <IconTsx icon='add' class={styles.addOptionPlus} />
          </Show>
          <Show when={toggled()}>
            <EmojiDropdownButton class={styles.emojiDropdownButton} inputField={inputField} />
          </Show>
        </Transition>
      </div>
      <div class={styles.labelRow}>
        <div class={styles.labelText}>
          <Transition name='fade' mode='outin' onAfterEnter={onAfterEnter}>
            <Show when={toggled()} fallback={<I18nTsx key='Chat.Poll.AddAnOption' />}>
              <div class={styles.inputFieldInternals}>
                {inputField.input}
                {inputField.placeholder}
              </div>
            </Show>
          </Transition>
        </div>
      </div>
      <div class={styles.optionImage}>
        <Show when={toggled()}>
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


const PollType = (props: Pick<PollMessageContentProps, 'closed' | 'hasCorrectAnswer' | 'showWhoVoted'>) => {
  const key = createMemo((): LangPackKey => {
    if(props.closed) return 'Chat.Poll.Type.Closed';
    if(props.hasCorrectAnswer) return props.showWhoVoted ? 'Chat.Poll.Type.Quiz' : 'Chat.Poll.Type.AnonymousQuiz';
    return props.showWhoVoted ? 'Chat.Poll.Type.Public' : 'Chat.Poll.Type.Anonymous';
  });

  return (
    <I18nTsx key={key()} />
  );
};

// const votersCount = results.total_voters || 0;
// let key: LangPackKey;
// const args: FormatterArguments = [votersCount];
// if(this.isClosed) {
//   if(this.isQuiz) key = votersCount ? 'Chat.Quiz.TotalVotes' : 'Chat.Quiz.TotalVotesResultEmpty';
//   else key = votersCount ? 'Chat.Poll.TotalVotes1' : 'Chat.Poll.TotalVotesResultEmpty';
// } else {
//   if(this.isQuiz) key = votersCount ? 'Chat.Quiz.TotalVotes' : 'Chat.Quiz.TotalVotesEmpty';
//   else key = votersCount ? 'Chat.Poll.TotalVotes1' : 'Chat.Poll.TotalVotesEmpty';
// }
const PollResults = (props: Pick<PollMessageContentProps, 'closed' | 'hasCorrectAnswer' | 'showWhoVoted'>) => {
  const votersCount = 0;

  const key = createMemo((): LangPackKey => {
    if(props.closed) {
      if(props.hasCorrectAnswer) return votersCount ? 'Chat.Quiz.TotalVotes' : 'Chat.Poll.TotalVotesResultEmpty';
      else return votersCount ? 'Chat.Poll.TotalVotes1' : 'Chat.Poll.TotalVotesResultEmpty';
    } else {
      if(props.hasCorrectAnswer) return votersCount ? 'Chat.Quiz.TotalVotes' : 'Chat.Quiz.TotalVotesEmpty';
      else return votersCount ? 'Chat.Poll.TotalVotes1' : 'Chat.Poll.TotalVotesEmpty';
    }
  });

  return (
    <I18nTsx key={key()} args={[votersCount]} />
  );
};


type Option = {
  text: string;
  entities: MessageEntity[];
};

export type PollMessageContentProps = {
  question: string;
  questionEntities: MessageEntity[];
  description: string;
  descriptionEntities: MessageEntity[];
  pollOptions: Option[];
  allowAddingOptions: boolean;
  allowMultipleAnswers: boolean;
  hasCorrectAnswer: boolean;
  shuffleOptions: boolean;
  showWhoVoted: boolean;
  closed: boolean;
  hideResults: boolean;
};

export const PollMessageContent = defineSolidElement({
  name: 'poll-message-content',
  component: (props: PassedProps<PollMessageContentProps>) => {
    const [toggled, setToggled] = createSignal(false);
    const [explanationToggled, setExplanationToggled] = createSignal(false);
    const withImage = true;

    attachHotClassName(props.element, styles.container);

    const middleware = createMiddleware().get();

    const [chosenIndices, setChosenIndices] = createSignal<number[]>([]);
    const hasSelectedSomething = createMemo(() => chosenIndices().length > 0);

    const isChecked = createSelector(chosenIndices, (index: number, indices) => indices.includes(index));

    const [isFooterClickable, setIsFooterClickable] = createSignal(false);

    const handleToggle = (index: number) => {
      setChosenIndices(prev => {
        if(!props.allowMultipleAnswers) {
          return prev.includes(index) ? [] : [index];
        } else if(prev.includes(index)) {
          return prev.filter(i => i !== index);
        } else {
          return [...prev, index];
        }
      });
    };

    return (
      <>
        <div class={styles.pollImageWrapper}>
          <div class={styles.pollImage} />
        </div>
        <Show when={props.description}>
          <div class={styles.description}>
            {wrapRichText(props.description, {entities: props.descriptionEntities, middleware})}
          </div>
        </Show>
        <div class={styles.header}>
          <div class={styles.headerTitleContainer}>
            <div class={styles.headerTitle}>
              {wrapRichText(props.question, {entities: props.questionEntities, middleware})}
            </div>
            <div class={styles.headerSubtitle}>
              <PollType {...props} />
              <Transition name='fade-2'>
                <Show when={toggled()}>
                  <AvatarGroup />
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

        <For each={props.pollOptions}>
          {(option, index) => (
            <PollOption
              text={option}
              toggled={toggled()}
              checked={isChecked(index())}
              onToggle={() => handleToggle(index())}
              withImage={withImage}
              isCheckbox={props.allowMultipleAnswers}
            />
          )}
        </For>

        <Show when={props.allowAddingOptions}>
          <AddOption />
        </Show>

        <div
          class={styles.footer}
          classList={{[styles.clickable]: isFooterClickable()}}
          use:ripple={hasSelectedSomething()}
        >
          <Transition
            name='fade-2'
            mode='outin'
            onAfterExit={() => {
              setIsFooterClickable(hasSelectedSomething());
            }}
          >
            <Show when={hasSelectedSomething()} fallback={<PollResults {...props} />}>
              <I18nTsx key='Chat.Poll.SubmitVote' />
            </Show>
          </Transition>
        </div>
      </>
    );
  }
});
