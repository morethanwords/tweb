import {createAutoDeleteIcon} from '@components/autoDeleteIcon';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import {IconTsx} from '@components/iconTsx';
import InputField from '@components/inputField';
import {HeightTransition} from '@components/sidebarRight/tabs/adminRecentActions/heightTransition';
import SimpleFormField from '@components/simpleFormField';
import Space from '@components/space';
import StaticSwitch from '@components/staticSwitch';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import contextMenuController from '@helpers/contextMenuController';
import {formatFullSentTime} from '@helpers/date';
import formatDuration from '@helpers/formatDuration';
import pause from '@helpers/schedulers/pause';
import {I18nTsx} from '@helpers/solid/i18n';
import {requestRAF} from '@helpers/solid/requestRAF';
import classNames from '@helpers/string/classNames';
import {oneDayInSeconds, oneHourInSeconds, oneWeekInSeconds} from '@lib/constants';
import {LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {FilterBooleanKeys} from '@types';
import {createSignal, JSX, onMount, Show} from 'solid-js';
import {createStore} from 'solid-js/store';
import {supportedDescriptionFormattingTypes} from './config';
import {EmojiDropdownButton} from './emojiDropdownButton';
import styles from './styles.module.scss';


type PollSettingsStore = {
  showWhoVoted: boolean;
  allowMultipleAnswers: boolean;
  allowAddingOptions: boolean;
  allowRevoting: boolean;
  shuffleOptions: boolean;
  hasCorrectAnswer: boolean;
  durationLimited: boolean;

  timeLimit: TimeLimit;

  explanation: string;
  hideResults: boolean;
}

type TimeLimit = {
  type: 'duration';
  duration: number;
} | {
  type: 'timestamp';
  timestamp: number;
}

type BooleanSettingKey = FilterBooleanKeys<PollSettingsStore>;

const minEndTimeFromNowMinutes = 15;

export const PollSettingsSectionContent = () => {
  const {Row} = useHotReloadGuard();

  const [limitDurationExtraElement, setLimitDurationExtraElement] = createSignal<HTMLElement>();
  const [explanationElement, setExplanationElement] = createSignal<HTMLElement>();
  const [isDurationMenuOpen, setIsDurationMenuOpen] = createSignal(false);

  const [settings, setSettings] = createStore<PollSettingsStore>({
    showWhoVoted: true,
    allowMultipleAnswers: true,
    allowAddingOptions: true,
    allowRevoting: true,
    shuffleOptions: true,
    hasCorrectAnswer: false,
    durationLimited: false,
    timeLimit: {type: 'duration', duration: oneDayInSeconds},
    explanation: '',
    hideResults: false
  });

  const handleSettingsFlag = <T extends BooleanSettingKey>(flag: T) => () => {
    setSettings(flag, prev => !prev);
  };

  const explanationInput = new InputField({
    canHaveFormatting: supportedDescriptionFormattingTypes,
    canWrapCustomEmojis: true,
    withLinebreaks: true,
    onRawInput: (value) => {
      setSettings('explanation', value);
    }
  });


  const formatTimeInSpan = (timestamp: number) => {
    // Without the span solid will throw an error when the state is updated
    const span = document.createElement('span');
    span.appendChild(formatFullSentTime(timestamp, true));
    return span;
  };

  explanationInput.input.classList.replace('input-field-input', styles.inputField);

  return (
    <>
      <SettingsOption
        title='NewPoll.ShowWhoVoted'
        subtitle='NewPoll.ShowWhoVotedSubtitle'
        mediaStyle={getGradientStyle(0)}
        icon='eye1'
        checked={settings.showWhoVoted}
        onClick={handleSettingsFlag('showWhoVoted')}
      />
      <SettingsOption
        title='NewPoll.AllowMultipleAnswers'
        subtitle='NewPoll.AllowMultipleAnswersSubtitle'
        mediaStyle={getGradientStyle(1)}
        icon='poll_multiple_answers'
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
      <HeightTransition
        onAfterEnter={() => limitDurationExtraElement()?.scrollIntoView({behavior: 'smooth', block: 'center'})}
      >
        <Show when={settings.durationLimited}>
          <div style={{overflow: !isDurationMenuOpen() ? 'hidden' : undefined}}>
            <Space amount='0.25rem' />
            <div class={styles.smallerHrWrapper}>
              <hr class={styles.hr} />
            </div>
            <Space amount='0.25rem' />
            <div style={{'position': 'relative'}}>
              <Row clickable={() => setIsDurationMenuOpen(prev => !prev)}>
                <Row.Title>
                  <I18nTsx key='NewPoll.PollDuration' />
                </Row.Title>
                <Row.RightContent class={styles.pollDuration}>
                  {settings.timeLimit.type === 'duration' && wrapFormattedDuration(formatDuration(settings.timeLimit.duration))}
                  {settings.timeLimit.type === 'timestamp' && formatTimeInSpan(settings.timeLimit.timestamp)}
                </Row.RightContent>
              </Row>
              <Show when={isDurationMenuOpen()}>
                <PollDurationMenu
                  onOptionClick={(duration) => {
                    setSettings('timeLimit', {type: 'duration', duration});
                  }}
                  onCustomTimestamp={(timestamp) => {
                    setSettings('timeLimit', {type: 'timestamp', timestamp});
                  }}
                  onClose={() => setIsDurationMenuOpen(false)}
                />
              </Show>
            </div>
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
              value={settings.explanation}
              onChange={(value) => setSettings('explanation', value)}
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
    </>
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

const durationOptions = [
  oneHourInSeconds,
  oneHourInSeconds * 3,
  oneHourInSeconds * 8,
  oneDayInSeconds,
  oneDayInSeconds * 3,
  oneWeekInSeconds
];

const PollDurationMenu = (props: {
  onOptionClick: (duration: number) => void;
  onCustomTimestamp: (timestamp: number) => void;
  onClose?: () => void
}) => {
  const {ButtonMenuSync, PopupSchedulePost} = useHotReloadGuard();

  const format = (duration: number) => wrapFormattedDuration(formatDuration(duration, 1));

  const buttonMenu = ButtonMenuSync({
    buttons: [
      ...durationOptions.map((duration) => ({
        iconElement: createAutoDeleteIcon(duration),
        regularText: format(duration),
        onClick: () => {
          props.onOptionClick(duration);
        }
      })),
      {
        icon: 'tools',
        text: 'Other',
        onClick: () => {
          const minTimeDate = new Date();
          minTimeDate.setMinutes(minTimeDate.getMinutes() + minEndTimeFromNowMinutes);

          const minDate = new Date(minTimeDate);
          minDate.setHours(0, 0, 0, 0);

          new PopupSchedulePost({
            initDate: new Date(minTimeDate),
            captionKey: 'NewPoll.MinEndTime',
            minDate,
            minTimeDate,
            onPick: (timestamp) => {
              props.onCustomTimestamp(timestamp);
            },
            btnConfirmTodayLangKey: 'NewPoll.EndToday',
            btnConfirmOnDateLangKey: 'NewPoll.EndDate'
          }).show();
        }
      }
    ]
  });

  buttonMenu.classList.add('top-left');

  onMount(() => {
    requestRAF(() => {
      contextMenuController.openBtnMenu(buttonMenu, async() => {
        await pause(400);
        props.onClose?.();
      });
    });
  });

  return (
    <>{buttonMenu}</>
  );
};
