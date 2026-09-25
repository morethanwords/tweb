import {AutoHeight} from '@components/autoHeight';
import type InputField from '@components/inputField';
import {InputFieldTsx} from '@components/inputFieldTsx';
import isSendShortcutPressed from '@helpers/dom/isSendShortcutPressed';
import {doubleRaf} from '@helpers/schedulers';
import classNames from '@helpers/string/classNames';
import type {LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {Accessor, createEffect, createSignal, onCleanup, ParentProps} from 'solid-js';
import styles from './bodyContent.module.scss';

export const AiComposerSection = (props: ParentProps<{class?: string}>) => {
  return (
    <AutoHeight outerClass={classNames(styles.tabContent, props.class)}>
      {props.children}
    </AutoHeight>
  );
};

export const AiComposerPromptField = (props: {
  instanceRef?: (field: InputField) => void,
  label: LangPackKey,
  maxLength: number,
  onRawInput: (value: string) => void,
  value: string
}) => {
  return (
    <InputFieldTsx
      allowStartingSpace
      canWrapCustomEmojis={false}
      class={styles.promptInput}
      instanceRef={props.instanceRef}
      label={props.label}
      maxLength={props.maxLength}
      onRawInput={props.onRawInput}
      showLengthOn={100}
      value={props.value}
      withLinebreaks
    />
  );
};

export function useAiComposerPromptMaxLength() {
  const {useAppConfig} = useHotReloadGuard();
  const appConfig = useAppConfig();
  return () => appConfig.aicompose_tone_prompt_length_max || 1024;
}

export function useAiComposerPromptGeneration(options: {
  active?: Accessor<boolean>,
  canGenerate: Accessor<boolean>,
  prompt: Accessor<string>
}) {
  const [appliedPrompt, setAppliedPrompt] = createSignal<string>();
  const active = options.active || (() => true);

  const generate = () => {
    const prompt = options.prompt();
    if(!options.canGenerate()) return;
    if(appliedPrompt() !== prompt) {
      setAppliedPrompt(prompt);
      return;
    }

    setAppliedPrompt();
    queueMicrotask(() => {
      if(active() && options.prompt() === prompt) setAppliedPrompt(prompt);
    });
  };

  const reset = (nextPrompt?: string) => {
    if(nextPrompt === undefined || nextPrompt !== appliedPrompt()) setAppliedPrompt();
  };

  return {appliedPrompt, generate, reset};
}

export function useAiComposerPromptInput(options: {
  active: Accessor<boolean>,
  onSubmit: () => void
}) {
  let inputField: InputField;
  let removeKeydownListener: VoidFunction;

  const instanceRef = (field: InputField) => {
    removeKeydownListener?.();
    inputField = field;
    const onKeyDown = (event: KeyboardEvent) => {
      if(!isSendShortcutPressed(event)) return;
      event.preventDefault();
      options.onSubmit();
    };
    field.input.addEventListener('keydown', onKeyDown);
    removeKeydownListener = () => field.input.removeEventListener('keydown', onKeyDown);
  };

  createEffect(() => {
    if(!options.active()) return;
    void doubleRaf().then(() => {
      if(options.active() && inputField?.input.isConnected) inputField.input.focus();
    });
  });

  onCleanup(() => removeKeydownListener?.());
  return instanceRef;
}
