import {createAutoDeleteIcon} from '@components/autoDeleteIcon';
import {IconTsx} from '@components/iconTsx';
import InputField from '@components/inputField';
import SimpleFormField from '@components/simpleFormField';
import Space from '@components/space';
import StaticSwitch from '@components/staticSwitch';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import contextMenuController from '@helpers/contextMenuController';
import {formatFullSentTime} from '@helpers/date';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import formatDuration from '@helpers/formatDuration';
import {positionFloatingMenu} from '@helpers/positionMenu';
import pause from '@helpers/schedulers/pause';
import {HeightTransition} from '@helpers/solid/heightTransition';
import {I18nTsx} from '@helpers/solid/i18n';
import {requestRAF} from '@helpers/solid/requestRAF';
import classNames from '@helpers/string/classNames';
import {useIsCleaned} from '@hooks/useIsCleaned';
import {oneDayInSeconds, oneHourInSeconds, oneWeekInSeconds} from '@lib/constants';
import {LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {FilterBooleanKeys} from '@types';
import {Accessor, createEffect, createSignal, JSX, on, onCleanup, Show} from 'solid-js';
import {supportedDescriptionFormattingTypes} from './config';
import {EmojiButtonWithOpacity as EmojiDropdownButton} from './emojiButtonWithOpacity';
import {useSupportsMedia} from './utils';
import {MediaAttachment} from './mediaAttachment';
import {CreatePollStore, useCreatePollContext} from './storeContext';
import styles from './styles.module.scss';
import {useCreatePollLimits} from './useCreatePollLimits';

type BooleanSettingKey = FilterBooleanKeys<CreatePollStore>;

const minEndTimeFromNowMinutes = 5;

export const PollSettingsSectionContent = () => {
  const {Row} = useHotReloadGuard();
  const {maxExplanationLength} = useCreatePollLimits();
  const context = useCreatePollContext();
  const supportsMedia = useSupportsMedia();

  const [limitDurationExtraElement, setLimitDurationExtraElement] = createSignal<HTMLElement>();
  const [explanationElement, setExplanationElement] = createSignal<HTMLElement>();
  const [pollDurationRowElement, setPollDurationRowElement] = createSignal<HTMLElement>();
  const [isDurationMenuOpen, setIsDurationMenuOpen] = createSignal(false);


  const explanationInput = new InputField({
    canHaveFormatting: supportedDescriptionFormattingTypes,
    canWrapCustomEmojis: true,
    withLinebreaks: true,
    onRawInput: () => {
      const {value, entities} = getRichValueWithCaret(explanationInput.input);
      context.setStore({
        explanation: value,
        explanationEntities: entities
      });
    }
  });

  explanationInput.input.classList.replace('input-field-input', styles.inputField);

  const formatTimeInSpan = (timestamp: number) => {
    // Without the span, solid will throw an error when the state is updated
    const span = document.createElement('span');
    span.appendChild(formatFullSentTime(timestamp, true));
    return span;
  };

  const handleSettingsFlag = <T extends BooleanSettingKey>(flag: T) => () => {
    context.setStore(flag, prev => !prev);
  };

  usePollDurationMenu({
    open: isDurationMenuOpen,
    container: pollDurationRowElement,
    onOptionClick: (duration) => {
      context.setStore('timeLimit', {type: 'duration', duration});
    },
    onCustomTimestamp: (timestamp) => {
      context.setStore('timeLimit', {type: 'timestamp', timestamp});
    },
    onClose: () => setIsDurationMenuOpen(false)
  });

  return (
    <>
      <Show when={!context.isBroadcast()}>
        <SettingsOption
          title='NewPoll.ShowWhoVoted'
          subtitle='NewPoll.ShowWhoVotedSubtitle'
          mediaStyle={getGradientStyle(0)}
          icon='eye1'
          checked={context.store.showWhoVoted}
          onClick={handleSettingsFlag('showWhoVoted')}
        />
      </Show>
      <SettingsOption
        title='NewPoll.AllowMultipleAnswers'
        subtitle='NewPoll.AllowMultipleAnswersSubtitle'
        mediaStyle={getGradientStyle(1)}
        icon='poll_multiple_answers'
        checked={context.store.allowMultipleAnswers}
        onClick={handleSettingsFlag('allowMultipleAnswers')}
      />
      <Show when={!context.isBroadcast()}>
        <SettingsOption
          title='NewPoll.AllowAddingOptions'
          subtitle='NewPoll.AllowAddingOptionsSubtitle'
          mediaStyle={getGradientStyle(2)}
          icon='checklist_add'
          checked={context.store.allowAddingOptions}
          disabled={context.store.hasCorrectAnswer}
          onClick={handleSettingsFlag('allowAddingOptions')}
        />
      </Show>
      <SettingsOption
        title='NewPoll.AllowRevoting'
        subtitle='NewPoll.AllowRevotingSubtitle'
        mediaStyle={getGradientStyle(3)}
        icon='flip'
        checked={context.store.allowRevoting}
        onClick={handleSettingsFlag('allowRevoting')}
      />
      <SettingsOption
        title='NewPoll.ShuffleOptions'
        subtitle='NewPoll.ShuffleOptionsSubtitle'
        mediaStyle={getGradientStyle(4)}
        icon='replace'
        checked={context.store.shuffleOptions}
        onClick={handleSettingsFlag('shuffleOptions')}
      />
      <SettingsOption
        title='NewPoll.SetCorrectAnswer'
        subtitle='NewPoll.SetCorrectAnswerSubtitle'
        mediaStyle={getGradientStyle(5)}
        icon='checklist_done'
        checked={context.store.hasCorrectAnswer}
        onClick={() => {
          if(!context.store.hasCorrectAnswer) {
            context.setStore({
              hasCorrectAnswer: true,
              allowAddingOptions: false,
              allowRevoting: false
            });
          } else {
            context.setStore({
              hasCorrectAnswer: false
            });
          }
        }}
      />
      <SettingsOption
        title='NewPoll.LimitDuration'
        subtitle='NewPoll.LimitDurationSubtitle'
        mediaStyle={getGradientStyle(6)}
        icon='timer'
        checked={context.store.durationLimited}
        onClick={handleSettingsFlag('durationLimited')}
      />
      <HeightTransition
        onAfterEnter={() => limitDurationExtraElement()?.scrollIntoView({behavior: 'smooth', block: 'center'})}
      >
        <Show when={context.store.durationLimited}>
          <div ref={setLimitDurationExtraElement} style={{overflow: !isDurationMenuOpen() ? 'hidden' : undefined}}>
            <Space amount='0.25rem' />
            <div class={styles.smallerHrWrapper}>
              <hr class={styles.hr} />
            </div>
            <Space amount='0.25rem' />
            <div style={{'position': 'relative'}}>
              <Row ref={setPollDurationRowElement} clickable={() => setIsDurationMenuOpen(prev => !prev)}>
                <Row.Title>
                  <I18nTsx key='NewPoll.PollDuration' />
                </Row.Title>
                <Row.RightContent class={styles.pollDuration}>
                  <Show when={context.store.timeLimit?.type === 'duration' && context.store.timeLimit.duration} keyed>
                    {(duration) => wrapFormattedDuration(formatDuration(duration))}
                  </Show>
                  <Show when={context.store.timeLimit?.type === 'timestamp' && context.store.timeLimit.timestamp} keyed>
                    {(timestamp) => formatTimeInSpan(timestamp)}
                  </Show>
                </Row.RightContent>
              </Row>
            </div>
            <Row clickable={handleSettingsFlag('hideResults')}>
              <Row.Title>
                <I18nTsx key='NewPoll.HideResults' />
              </Row.Title>
              <Row.Subtitle>
                <I18nTsx key='NewPoll.HideResultsSubtitle' />
              </Row.Subtitle>
              <Row.RightContent>
                <StaticSwitch
                  checked={context.store.hideResults}
                />
              </Row.RightContent>
            </Row>
          </div>
        </Show>
      </HeightTransition>

      <HeightTransition onAfterEnter={() => explanationElement()?.scrollIntoView({behavior: 'smooth', block: 'center'})}>
        <Show when={context.store.hasCorrectAnswer}>
          <div ref={setExplanationElement} style={{overflow: 'hidden'}}>
            <Space amount='1rem' />

            <SimpleFormField
              value={context.store.explanation}
              class={classNames(styles.flexFull, styles.formField)}
              withEndButtonIcon
              withMinHeight
              isMarkupTooltipHost
            >
              <SimpleFormField.InputStub>
                {explanationInput.input}
              </SimpleFormField.InputStub>
              <SimpleFormField.Label><I18nTsx key='NewPoll.Explanation.Placeholder' /></SimpleFormField.Label>
              <SimpleFormField.SideContent withFixedIcon first last>
                <EmojiDropdownButton inputField={explanationInput} />
              </SimpleFormField.SideContent>
              <Show when={supportsMedia('photo')}>
                <SimpleFormField.WithAutoLengthCounter
                  maxLength={maxExplanationLength()}
                  first={!context.store.explanationAttachment}
                  last
                  withFixedIcon
                >
                  <MediaAttachment
                    imgClass={styles.mediaAttachmentImage}
                    attachedMedia={context.store.explanationAttachment}
                    onAttach={(value) => {
                      context.setStore('explanationAttachment', value);
                    }}
                  />
                </SimpleFormField.WithAutoLengthCounter>
              </Show>
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
        <StaticSwitch checked={props.checked} handleContent={props.disabled ? <StaticSwitch.HandleIcon icon='lock' /> : undefined} />
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

type PollDurationMenuArgs = {
  open: Accessor<boolean>;
  container: Accessor<HTMLElement>;
  onOptionClick: (duration: number) => void;
  onCustomTimestamp: (timestamp: number) => void;
  onClose?: () => void;
};

const usePollDurationMenu = (args: PollDurationMenuArgs) => {
  const {ButtonMenuSync, PopupSchedulePost} = useHotReloadGuard();

  const {closePeriodMax} = useCreatePollLimits();

  const format = (duration: number) => wrapFormattedDuration(formatDuration(duration, 1));

  const isCleaned = useIsCleaned();

  createEffect(on(args.open, (open) => {
    if(!open) return;

    const buttonMenu = ButtonMenuSync({
      buttons: [
        ...durationOptions.map((duration) => ({
          iconElement: createAutoDeleteIcon(duration),
          regularText: format(duration),
          onClick: () => {
            args.onOptionClick(duration);
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

            const maxDate = new Date(minDate);
            maxDate.setDate(maxDate.getDate() + Math.floor(closePeriodMax() / oneDayInSeconds));

            new PopupSchedulePost({
              initDate: new Date(minTimeDate),
              captionKey: 'NewPoll.MinEndTime',
              minDate,
              minTimeDate,
              maxDate,
              onPick: (timestamp) => {
                args.onCustomTimestamp(timestamp);
              },
              btnConfirmTodayLangKey: 'NewPoll.EndToday',
              btnConfirmOnDateLangKey: 'NewPoll.EndDate'
            }).show();
          }
        }
      ]
    });

    buttonMenu.classList.add(styles.pollDurationMenu);

    document.body.appendChild(buttonMenu);

    requestRAF(() => {
      if(isCleaned()) return;

      positionFloatingMenu(args.container().getBoundingClientRect(), buttonMenu, 'top-end');
      contextMenuController.openBtnMenu(buttonMenu, async() => {
        await pause(400);
        args.onClose?.();
      });
    });

    onCleanup(() => {
      buttonMenu.remove();
    });
  }));
};
