import {ButtonIconTsx} from '@components/buttonIconTsx';
import Button from '@components/buttonTsx';
import {MarkupTooltipTypes} from '@components/chat/markupTooltip';
import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import {IconTsx} from '@components/iconTsx';
import InputField from '@components/inputField';
import Scrollable from '@components/scrollable2';
import SimpleFormField, {useSimpleFormFieldContext} from '@components/simpleFormField';
import Space from '@components/space';
import StaticSwitch from '@components/staticSwitch';
import {createSortableList} from '@helpers/solid/createSortableList';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {FilterBooleanKeys} from '@types';
import {createMemo, createSignal, For, JSX, onCleanup, Ref, Show} from 'solid-js';
import {createStore} from 'solid-js/store';
import styles from './createPoll.module.scss';
import PopupElement, {createPopup} from './indexTsx';
import {HeightTransition} from '@components/sidebarRight/tabs/adminRecentActions/heightTransition';


const supportedDescriptionFormattingTypes: MarkupTooltipTypes[] = ['bold', 'italic', 'link', 'underline', 'monospace', 'spoiler', 'strikethrough'];

export const CreatePollPopup = () => {
  return (
    <PopupElement
      show
      class={styles.popup}
      containerClass={styles.container}
    >
      <Header />
      <hr class={styles.hr} />
      <PopupElement.Body>
        <BodyContent />
      </PopupElement.Body>
      <PopupElement.Footer>
        ssomething
      </PopupElement.Footer>
    </PopupElement>
  );
};

const Header = () => {
  const [question, setQuestion] = createSignal('');
  const [description, setDescription] = createSignal('');

  const questionInput = new InputField({
    canWrapCustomEmojis: true,
    onRawInput: (value) => {
      setQuestion(value);
    }
  });

  questionInput.input.classList.replace('input-field-input', styles.inputField);

  const descriptionInput = new InputField({
    canHaveFormatting: supportedDescriptionFormattingTypes,
    canWrapCustomEmojis: true,
    withLinebreaks: true,
    onRawInput: (value) => {
      setDescription(value);
    }
  });

  descriptionInput.input.classList.replace('input-field-input', styles.inputField);

  return (
    <PopupElement.Header class={styles.header}>
      <PopupElement.CloseButton class={styles.closeButton} />

      <PopupElement.Title>
        <I18nTsx key='NewPoll' />
      </PopupElement.Title>

      <Button class={styles.confirmButton} primaryFilled>
        <I18nTsx key='Create' />
      </Button>

      <Space amount='1rem' class={styles.flexFull} />

      <SimpleFormField
        value={question()}
        onChange={setQuestion}
        class={classNames(styles.flexFull, styles.formField)}
        withEndButtonIcon
        withMinHeight
      >
        <SimpleFormField.InputStub>
          {questionInput.input}
        </SimpleFormField.InputStub>
        <SimpleFormField.Label><I18nTsx key='AskAQuestion' /></SimpleFormField.Label>

        <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first last>
          <EmojiDropdownButton inputField={questionInput} />
        </SimpleFormField.SideContent>
      </SimpleFormField>

      <Space amount='1rem' class={styles.flexFull} />

      <SimpleFormField
        value={description()}
        onChange={setDescription}
        class={classNames(styles.flexFull, styles.formField)}
        withEndButtonIcon
        withMinHeight
      >
        <SimpleFormField.InputStub>
          {descriptionInput.input}
        </SimpleFormField.InputStub>
        <SimpleFormField.Label><I18nTsx key='DescriptionOptionalPlaceholder' /></SimpleFormField.Label>
        <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first last>
          <EmojiDropdownButton inputField={descriptionInput} />
        </SimpleFormField.SideContent>
        <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first last>
          <ButtonIconTsx icon='attach' />
        </SimpleFormField.SideContent>
      </SimpleFormField>

    </PopupElement.Header>
  );
};


type PollSettingsStore = {
  showWhoVoted: boolean;
  allowMultipleAnswers: boolean;
  allowAddingOptions: boolean;
  allowRevoting: boolean;
  shuffleOptions: boolean;
  hasCorrectAnswer: boolean;
  durationLimited: boolean;

  duration: number;
  hideResults: boolean;
}

type BooleanSettingKey = FilterBooleanKeys<PollSettingsStore>;

const BodyContent = () => {
  const {Row} = useHotReloadGuard();
  let idSeed = 0;
  const [items, setItems] = createSignal([...Array(5).fill('').map(() => ({id: idSeed++}))]);
  const itemsLength = createMemo(() => items().length);

  const [scrollable, setScrollable] = createSignal<HTMLElement>();
  const [limitDurationExtraElement, setLimitDurationExtraElement] = createSignal<HTMLElement>();
  const [explanationElement, setExplanationElement] = createSignal<HTMLElement>();

  const sortable = createSortableList({
    container: scrollable,
    items,
    getId: item => item.id,
    onReorder: setItems
  });

  const [settings, setSettings] = createStore<PollSettingsStore>({
    showWhoVoted: true,
    allowMultipleAnswers: true,
    allowAddingOptions: true,
    allowRevoting: true,
    shuffleOptions: true,
    hasCorrectAnswer: false,
    durationLimited: false,
    duration: 0,
    hideResults: false
  });

  const [explanation, setExplanation] = createSignal('');

  const handleSettingsFlag = <T extends BooleanSettingKey>(flag: T) => () => {
    setSettings(flag, prev => !prev);
  };

  const explanationInput = new InputField({
    canHaveFormatting: supportedDescriptionFormattingTypes,
    canWrapCustomEmojis: true,
    withLinebreaks: true,
    onRawInput: (value) => {
      setExplanation(value);
    }
  });

  explanationInput.input.classList.replace('input-field-input', styles.inputField);

  return (
    <Scrollable ref={setScrollable}>
      <div class={styles.sectionTitle}>
        <I18nTsx key='PollOptions' />
      </div>

      <Space amount='0.5rem' />

      <div class={styles.section}>
        <For each={items()}>
          {(item, index) => (
            <>
              <PollOptionField
                ref={sortable.itemRef(item.id)}
                value={item.id.toString()}
                onPointerDown={sortable.handleProps(item.id).onPointerDown}
                style={sortable.itemStyle(item.id)}
              />
              {index() < itemsLength() - 1 && <Space amount='0.75rem' />}
            </>
          )}
        </For>

        <Space amount='0.5rem' />

        <Button class={styles.addOptionButton} primary>
          <IconTsx class={styles.addOptionButtonIcon} icon='plus' />
          <I18nTsx key='NewPoll.OptionsAddOption' />
        </Button>
      </div>
      <div class={styles.sectionTitle}>
        <I18nTsx key='Settings' />
      </div>

      <Space amount='0.5rem' />

      <div class={styles.section}>
        <SettingsOption
          title='NewPoll.ShowWhoVoted'
          subtitle='NewPoll.ShowWhoVotedSubtitle'
          mediaStyle={getGradientStyle(0)}
          icon='eye'
          checked={settings.showWhoVoted}
          onClick={handleSettingsFlag('showWhoVoted')}
        />
        <SettingsOption
          title='NewPoll.AllowMultipleAnswers'
          subtitle='NewPoll.AllowMultipleAnswersSubtitle'
          mediaStyle={getGradientStyle(1)}
          icon='list'
          checked={settings.allowMultipleAnswers}
          onClick={handleSettingsFlag('allowMultipleAnswers')}
        />
        <SettingsOption
          title='NewPoll.AllowAddingOptions'
          subtitle='NewPoll.AllowAddingOptionsSubtitle'
          mediaStyle={getGradientStyle(2)}
          icon='checklist_add'
          checked={settings.allowAddingOptions}
          onClick={handleSettingsFlag('allowAddingOptions')}
        />
        <SettingsOption
          title='NewPoll.AllowRevoting'
          subtitle='NewPoll.AllowRevotingSubtitle'
          mediaStyle={getGradientStyle(3)}
          icon='flip'
          checked={settings.allowRevoting}
          onClick={handleSettingsFlag('allowRevoting')}
        />
        <SettingsOption
          title='NewPoll.ShuffleOptions'
          subtitle='NewPoll.ShuffleOptionsSubtitle'
          mediaStyle={getGradientStyle(4)}
          icon='replace'
          checked={settings.shuffleOptions}
          onClick={handleSettingsFlag('shuffleOptions')}
        />
        <SettingsOption
          title='NewPoll.SetCorrectAnswer'
          subtitle='NewPoll.SetCorrectAnswerSubtitle'
          mediaStyle={getGradientStyle(5)}
          icon='checklist_done'
          checked={settings.hasCorrectAnswer}
          onClick={handleSettingsFlag('hasCorrectAnswer')}
        />
        <SettingsOption
          title='NewPoll.LimitDuration'
          subtitle='NewPoll.LimitDurationSubtitle'
          mediaStyle={getGradientStyle(6)}
          icon='timer'
          checked={settings.durationLimited}
          onClick={handleSettingsFlag('durationLimited')}
        />
        <HeightTransition onAfterEnter={() => limitDurationExtraElement()?.scrollIntoView({behavior: 'smooth', block: 'center'})}>
          <Show when={settings.durationLimited}>
            <div style={{overflow: 'hidden'}}>
              <div class={styles.smallerHrWrapper}>
                <hr class={styles.hr} />
              </div>
              <Row>
                <Row.Title>
                  <I18nTsx key='NewPoll.PollDuration' />
                </Row.Title>
                <Row.RightContent>
                  24 hours
                </Row.RightContent>
              </Row>
              <Row ref={setLimitDurationExtraElement} clickable={handleSettingsFlag('hideResults')}>
                <Row.Title>
                  <I18nTsx key='NewPoll.HideResults' />
                </Row.Title>
                <Row.RightContent>
                  <StaticSwitch
                    checked={settings.hideResults}
                  />
                </Row.RightContent>
              </Row>
            </div>
          </Show>
        </HeightTransition>

        <HeightTransition onAfterEnter={() => explanationElement()?.scrollIntoView({behavior: 'smooth', block: 'center'})}>
          <Show when={settings.hasCorrectAnswer}>
            <div ref={setExplanationElement} style={{overflow: 'hidden'}}>
              <Space amount='1rem' />

              <SimpleFormField
                value={explanation()}
                onChange={setExplanation}
                class={classNames(styles.flexFull, styles.formField)}
                withEndButtonIcon
                withMinHeight
              >
                <SimpleFormField.InputStub>
                  {explanationInput.input}
                </SimpleFormField.InputStub>
                <SimpleFormField.Label><I18nTsx key='NewPoll.Explanation.Placeholder' /></SimpleFormField.Label>
                <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first last>
                  <EmojiDropdownButton inputField={explanationInput} />
                </SimpleFormField.SideContent>
                <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first last>
                  <ButtonIconTsx icon='attach' />
                </SimpleFormField.SideContent>
              </SimpleFormField>

              <div class={styles.caption}>
                <I18nTsx key='AddAnExplanationInfo' />
              </div>
            </div>
          </Show>
        </HeightTransition>
      </div>
    </Scrollable>
  );
};

const PollOptionField = (props: {
  ref?: Ref<HTMLDivElement>;
  value?: string;
  style?: JSX.CSSProperties;
  onPointerDown?: JSX.HTMLAttributes<HTMLElement>['onPointerDown'];
}) => {
  const [value, setValue] = createSignal('');

  const inputField = new InputField({
    placeholder: 'NewPoll.Option',
    canWrapCustomEmojis: true,
    onRawInput: (value) => {
      setValue(value);
    }
  });

  props.value && inputField.setValueSilently(props.value);
  inputField.input.classList.replace('input-field-input', styles.inputField);
  inputField.placeholder.classList.add(styles.inputFieldPlaceholder);

  return (
    <SimpleFormField
      ref={props.ref}
      value={value()}
      onChange={setValue}
      class={classNames(styles.flexFull, styles.formField)}
      withEndButtonIcon
      withStartButtonIcon
      withMinHeight
      solidBackground
      style={props.style}
    >
      <SimpleFormField.SideContent
        class={styles.draggableSideContent}
        first
        last
        onPointerDown={props.onPointerDown}
      >
        <IconTsx icon='menu' />
      </SimpleFormField.SideContent>
      <SimpleFormField.InputStub>
        {inputField.input}
        {inputField.placeholder}
      </SimpleFormField.InputStub>
      <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first last>
        <EmojiDropdownButton inputField={inputField} />
      </SimpleFormField.SideContent>
      <SimpleFormField.SideContent class={styles.sideContentWithFixedIcon} first last>
        <ButtonIconTsx icon='attach' />
      </SimpleFormField.SideContent>
    </SimpleFormField>
  );
};

const gradients = [
  ['#1ba0eb', '#2294e6'],
  ['#ee9b19', '#e48e16'],
  ['#2fbacc', '#2aa5ca'],
  ['#bd69f0', '#a459e1'],
  ['#f0842c', '#e36b1c'],
  ['#4ec643', '#2fb837'],
  ['#ef4e54', '#e33d55']
] as const;

const getGradientStyle = (index: number): JSX.CSSProperties => ({
  '--gradient-start': gradients[index][0],
  '--gradient-end': gradients[index][1]
});

const EmojiDropdownButton = (props: { inputField: InputField }) => {
  const {createEmojiDropdownButton} = useHotReloadGuard();
  const {useSetForceFocused} = useSimpleFormFieldContext();

  const button = createMemo(() => {
    const setForceFocused = useSetForceFocused();

    let emoticonsDropdown: EmoticonsDropdown;

    const {button} = createEmojiDropdownButton({
      inputField: props.inputField,
      onEmoticonsDropdown: (value) => {
        emoticonsDropdown = value;

        setForceFocused(!!emoticonsDropdown);
        button.classList.toggle(styles.forceFocused, !!emoticonsDropdown);
      }
    });

    onCleanup(() => {
      emoticonsDropdown?.hideAndDestroy();
    });

    button.classList.add(styles.emojiDropdownButton);
    button.tabIndex = -1;

    return button;
  });

  return (
    <>{button()}</>
  );
};

const SettingsOption = (props: {
  title: LangPackKey;
  subtitle: LangPackKey;
  mediaStyle: JSX.CSSProperties;
  icon: Icon;
  disabled?: boolean;
  checked?: boolean;
  onClick?: () => void;
}) => {
  const {Row} = useHotReloadGuard();

  return (
    <Row clickable={props.onClick} disabled={props.disabled}>
      <Row.Media class={styles.mediaIcon} size='small' style={props.mediaStyle}>
        <IconTsx icon={props.icon} />
      </Row.Media>
      <Row.Title>
        <I18nTsx key={props.title} />
      </Row.Title>
      <Row.Subtitle><I18nTsx key={props.subtitle} /></Row.Subtitle>
      <Row.RightContent>
        <StaticSwitch checked={props.checked} />
      </Row.RightContent>
    </Row>
  );
};

export function openCreatePollPopup(HotReloadGuard: typeof SolidJSHotReloadGuardProvider) {
  createPopup(() => <HotReloadGuard><CreatePollPopup /></HotReloadGuard>);
}
